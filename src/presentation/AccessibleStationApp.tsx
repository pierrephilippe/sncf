"use client";

import { useEffect, useMemo, useState } from "react";
import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";
import { nearbyStations, searchStations, stationAnnouncements, stationBoard } from "./apiClient";
import { useFavorites } from "./useFavorites";

type Tab = BoardType | "announcements";

const formatTime = (isoDate: string): string =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(isoDate));

const statusLabel: Record<BoardItem["status"], string> = {
  on_time: "A l'heure",
  delayed: "Retard",
  cancelled: "Supprime",
  disrupted: "Perturbe",
  unknown: "Non confirme",
};

export function AccessibleStationApp() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("departures");
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setStatus("Recherche des gares en cours.");
      setError("");
      try {
        setSuggestions(await searchStations(query));
        setStatus("Suggestions mises a jour.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Recherche indisponible.");
        setStatus("");
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!selectedStation) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, activeTab]);

  const refresh = async () => {
    if (!selectedStation) return;
    setStatus("Mise a jour des informations voyageurs.");
    setError("");

    try {
      if (activeTab === "announcements") {
        setAnnouncements(await stationAnnouncements(selectedStation.id));
      } else {
        setBoard(await stationBoard(selectedStation.id, activeTab));
      }
      setUpdatedAt(new Date().toISOString());
      setStatus("Informations mises a jour.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Informations indisponibles.");
      setStatus("");
    }
  };

  const findNearby = () => {
    if (!navigator.geolocation) {
      setError("La geolocalisation n'est pas disponible sur cet appareil.");
      return;
    }

    setStatus("Recherche des gares autour de vous.");
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const stations = await nearbyStations(position.coords.latitude, position.coords.longitude);
          setSuggestions(stations);
          setStatus(stations.length ? "Gares proches trouvees." : "Aucune gare proche trouvee.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Recherche autour de vous indisponible.");
          setStatus("");
        }
      },
      () => {
        setError("Autorisation de geolocalisation refusee ou position indisponible.");
        setStatus("");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  const visibleBoard = useMemo(() => board, [board]);

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">SNCF accessible</p>
        <h1>Les informations de gare, lisibles et disponibles sur mobile</h1>
        <p className="lead">
          Recherchez une gare, consultez les departs, arrivees, retards et annonces textuelles
          reconstruites depuis les donnees SNCF.
        </p>
      </header>

      <section className="panel" aria-labelledby="recherche-title">
        <h2 id="recherche-title">Choisir une gare</h2>
        <div className="toolbar">
          <button className="button" type="button" onClick={findNearby}>
            Autour de moi
          </button>
        </div>
        <div className="field">
          <label htmlFor="station-search">Nom de gare</label>
          <div className="search-row">
            <input
              id="station-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Exemple: Lyon Part Dieu"
              autoComplete="off"
            />
          </div>
        </div>

        <p className={error ? "status error" : "status"} role="status" aria-live="polite">
          {error || status}
        </p>

        {suggestions.length > 0 && (
          <ul className="suggestions" aria-label="Suggestions de gares">
            {suggestions.map((station) => (
              <li key={station.id}>
                <button
                  className="suggestion-button"
                  type="button"
                  onClick={() => {
                    setSelectedStation(station);
                    setQuery(station.name);
                    setSuggestions([]);
                  }}
                >
                  <strong>{station.name}</strong>
                  {station.distanceMeters ? (
                    <span className="muted"> - {Math.round(station.distanceMeters)} metres</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {favorites.length > 0 && (
        <section className="panel" aria-labelledby="favoris-title">
          <h2 id="favoris-title">Favoris</h2>
          <ul className="favorite-list">
            {favorites.map((station) => (
              <li className="favorite-row" key={station.id}>
                <button className="suggestion-button" type="button" onClick={() => setSelectedStation(station)}>
                  {station.name}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Retirer ${station.name} des favoris`}
                  onClick={() => removeFavorite(station.id)}
                >
                  X
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedStation && (
        <section className="panel" aria-labelledby="station-title">
          <div className="station-header">
            <div>
              <h2 id="station-title">{selectedStation.name}</h2>
              {updatedAt && <p className="muted">Derniere mise a jour: {formatTime(updatedAt)}</p>}
            </div>
            <div className="toolbar">
              <button className="button-secondary" type="button" onClick={refresh}>
                Actualiser
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() =>
                  isFavorite(selectedStation.id)
                    ? removeFavorite(selectedStation.id)
                    : addFavorite(selectedStation)
                }
              >
                {isFavorite(selectedStation.id) ? "Retirer favori" : "Ajouter favori"}
              </button>
            </div>
          </div>

          <div className="tabs" role="tablist" aria-label="Informations disponibles">
            <button
              className="tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "departures"}
              onClick={() => setActiveTab("departures")}
            >
              Departs
            </button>
            <button
              className="tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "arrivals"}
              onClick={() => setActiveTab("arrivals")}
            >
              Arrivees
            </button>
            <button
              className="tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "announcements"}
              onClick={() => setActiveTab("announcements")}
            >
              Annonces
            </button>
          </div>

          {activeTab === "announcements" ? (
            <AnnouncementList announcements={announcements} />
          ) : (
            <BoardList items={visibleBoard} />
          )}
        </section>
      )}
    </div>
  );
}

function BoardList({ items }: { items: BoardItem[] }) {
  if (items.length === 0) return <p className="muted">Aucune information a afficher pour le moment.</p>;

  return (
    <ul className="board-list" aria-label="Tableau des trains">
      {items.map((item) => (
        <li className="board-item" key={item.id}>
          <div className="board-topline">
            <div>
              <p className="destination">{item.destination}</p>
              <p className="muted">{item.line ?? "Ligne non communiquee"}</p>
            </div>
            <time className="time" dateTime={item.expectedTime ?? item.time}>
              {formatTime(item.expectedTime ?? item.time)}
            </time>
          </div>
          <div className="meta">
            {item.trainNumber && <span className="tag">Train {item.trainNumber}</span>}
            <span className="tag">Voie {item.platform ?? "non communiquee"}</span>
            <span className={`tag ${item.status === "cancelled" ? "danger" : item.status === "delayed" || item.status === "disrupted" ? "warning" : ""}`}>
              {statusLabel[item.status]}
            </span>
          </div>
          {item.disruptions.map((disruption) => (
            <p className="muted" key={disruption.id}>
              {disruption.title}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

function AnnouncementList({ announcements }: { announcements: Announcement[] }) {
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  if (announcements.length === 0) return <p className="muted">Aucune annonce prioritaire pour le moment.</p>;

  return (
    <ul className="announcement-list" aria-label="Annonces textuelles">
      {announcements.map((announcement) => (
        <li className="announcement" key={announcement.id} data-priority={announcement.priority}>
          <p>{announcement.text}</p>
          <button className="button-secondary" type="button" onClick={() => speak(announcement.text)}>
            Lire
          </button>
        </li>
      ))}
    </ul>
  );
}
