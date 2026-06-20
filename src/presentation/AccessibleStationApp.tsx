"use client";

import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  Megaphone,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";
import { nearbyStations, searchStations, stationAnnouncements, stationBoard } from "./apiClient";
import { ThemeControls } from "./ThemeControls";
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

const priorityLabel: Record<Announcement["priority"], string> = {
  critical: "Priorite haute",
  warning: "A surveiller",
  info: "Information",
};

const readableError = (cause: unknown, fallback: string): string => {
  if (!(cause instanceof Error) || !cause.message.trim()) return fallback;
  if (cause.message === "Failed to fetch" || cause.message === "NetworkError when attempting to fetch resource.") {
    return "Connexion impossible. Verifiez votre reseau ou reessayez dans quelques instants.";
  }
  return cause.message;
};

const StatusIcon = ({ status }: { status: BoardItem["status"] }) => {
  if (status === "cancelled") return <XCircle aria-hidden="true" />;
  if (status === "delayed") return <Clock3 aria-hidden="true" />;
  if (status === "disrupted") return <AlertTriangle aria-hidden="true" />;
  if (status === "on_time") return <CheckCircle2 aria-hidden="true" />;
  return <Info aria-hidden="true" />;
};

const PriorityIcon = ({ priority }: { priority: Announcement["priority"] }) => {
  if (priority === "critical") return <AlertTriangle aria-hidden="true" />;
  if (priority === "warning") return <Info aria-hidden="true" />;
  return <Megaphone aria-hidden="true" />;
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
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

  useEffect(() => {
    if (selectedStation && query.trim() === selectedStation.name) {
      setSuggestions([]);
      return;
    }

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
        setError(readableError(cause, "Recherche indisponible. Reessayez dans quelques instants."));
        setStatus("");
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query, selectedStation]);

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
      setError(readableError(cause, "Informations indisponibles. Reessayez dans quelques instants."));
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
          setError(readableError(cause, "Recherche autour de vous indisponible. Reessayez dans quelques instants."));
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
  const selectStation = (station: Station) => {
    setSelectedStation(station);
    setQuery(station.name);
    setSuggestions([]);
    setFavoritesOpen(false);
    setIsMenuExpanded(false);
  };

  return (
    <div className="page">
      <header className="app-header">
        {!selectedStation && <h1 className="sr-only">SNCF</h1>}
        <div className="app-header-main">
          {selectedStation ? (
            <h1 className="current-station-name">{selectedStation.name}</h1>
          ) : (
            <div className="search-row" role="search">
              <label className="sr-only" htmlFor="station-search">
                Nom de gare
              </label>
              <Search className="input-icon" aria-hidden="true" />
              <input
                id="station-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFavoritesOpen(false);
                }}
                placeholder="Rechercher une gare"
                autoComplete="off"
              />
            </div>
          )}

          <button
            className="button-secondary compact-button menu-toggle"
            type="button"
            aria-expanded={isMenuExpanded}
            aria-controls="expanded-menu"
            onClick={() => setIsMenuExpanded((expanded) => !expanded)}
          >
            <span className="button-content">
              <ChevronDown aria-hidden="true" />
              <span>Menu</span>
            </span>
          </button>
        </div>

        <nav className={`header-action-bar ${selectedStation ? "" : "is-empty"}`} aria-label="Actions de gare">
          {selectedStation && (
            <>
              <button className="button-secondary compact-button refresh-button" type="button" onClick={refresh}>
                <span className="button-content">
                  <RefreshCw aria-hidden="true" />
                  <span>Actualiser</span>
                </span>
              </button>

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
            </>
          )}
        </nav>

        {isMenuExpanded && (
          <div id="expanded-menu" className="expanded-menu">
            <h2 className="sr-only">Menu</h2>
            <ThemeControls />
            <div className="quick-actions">
              <button className="button-secondary compact-button" type="button" onClick={findNearby}>
                <span className="button-content">
                  <MapPin aria-hidden="true" />
                  <span>Autour</span>
                </span>
              </button>
              <button
                className="button-secondary compact-button"
                type="button"
                aria-expanded={favoritesOpen}
                aria-controls="favorites-panel"
                onClick={() => {
                  setFavoritesOpen((open) => !open);
                  setSuggestions([]);
                }}
              >
                <span className="button-content">
                  <Star aria-hidden="true" />
                  <span>Favoris</span>
                </span>
              </button>
            </div>
            {selectedStation && (
              <div className="quick-actions">
                <button
                  className="button-secondary compact-button"
                  type="button"
                  onClick={() =>
                    isFavorite(selectedStation.id)
                      ? removeFavorite(selectedStation.id)
                      : addFavorite(selectedStation)
                  }
                >
                  <span className="button-content">
                    <Star aria-hidden="true" />
                    <span>{isFavorite(selectedStation.id) ? "Retirer favori" : "Ajouter favori"}</span>
                  </span>
                </button>
                <button
                  className="button-secondary compact-button"
                  type="button"
                  aria-label="Effacer la gare selectionnee"
                  onClick={() => {
                    setSelectedStation(null);
                    setQuery("");
                    setBoard([]);
                    setAnnouncements([]);
                    setUpdatedAt(null);
                    setIsMenuExpanded(false);
                  }}
                >
                  <span className="button-content">
                    <X aria-hidden="true" />
                    <span>Effacer</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <p className={error ? "status error" : "status"} role="status" aria-live="polite">
          {error || status}
        </p>

        {suggestions.length > 0 && (
          <ul className="suggestions header-menu" aria-label="Suggestions de gares">
            {suggestions.map((station) => (
              <li key={station.id}>
                <button className="suggestion-button" type="button" onClick={() => selectStation(station)}>
                  <strong>{station.name}</strong>
                  {station.distanceMeters ? (
                    <span className="muted"> - {Math.round(station.distanceMeters)} metres</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        {favoritesOpen && (
          <div id="favorites-panel" className="header-menu" aria-label="Gares favorites">
            {favorites.length === 0 ? (
              <p className="muted">Aucune gare favorite.</p>
            ) : (
              <ul className="favorite-list">
                {favorites.map((station) => (
                  <li className="favorite-row" key={station.id}>
                    <button className="suggestion-button" type="button" onClick={() => selectStation(station)}>
                      {station.name}
                    </button>
                    <button
                      className="icon-button compact-button"
                      type="button"
                      aria-label={`Retirer ${station.name} des favoris`}
                      onClick={() => removeFavorite(station.id)}
                    >
                      <span className="button-content">
                        <Trash2 aria-hidden="true" />
                        <span>Retirer</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>

      {!selectedStation && <div className="empty-results-panel" aria-hidden="true" />}

      {selectedStation && (
        <section className="station-content" aria-labelledby="station-title">
          <div className="station-header">
            <div>
              <h2 id="station-title">{selectedStation.name}</h2>
              {updatedAt && <p className="muted">Derniere mise a jour: {formatTime(updatedAt)}</p>}
            </div>
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
              <span className="tag-content">
                <StatusIcon status={item.status} />
                <span>{statusLabel[item.status]}</span>
              </span>
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
          <p className="announcement-priority">
            <PriorityIcon priority={announcement.priority} />
            <span>{priorityLabel[announcement.priority]}</span>
          </p>
          <p>{announcement.text}</p>
          <button className="button-secondary" type="button" onClick={() => speak(announcement.text)}>
            <span className="button-content">
              <Volume2 aria-hidden="true" />
              <span>Lire</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
