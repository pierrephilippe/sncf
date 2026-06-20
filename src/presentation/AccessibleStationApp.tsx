"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Info,
  Megaphone,
  RefreshCw,
  Search,
  Trash2,
  X,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";
import { nearbyStations, searchStations, stationAnnouncements, stationBoard } from "./apiClient";
import { useFavorites } from "./useFavorites";

type Tab = BoardType | "announcements";
type SearchMode = "text" | "nearby" | "favorites";
type BoardState = Record<BoardType, BoardItem[]>;
type LoadedState = Record<Tab, boolean>;

const searchModeLabel: Record<SearchMode, string> = {
  text: "Recherche par saisie",
  nearby: "Recherche autour",
  favorites: "Selection de favoris",
};

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

const emptyBoardState = (): BoardState => ({
  departures: [],
  arrivals: [],
});

const emptyLoadedState = (): LoadedState => ({
  departures: false,
  arrivals: false,
  announcements: false,
});

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
  const [boards, setBoards] = useState<BoardState>(() => emptyBoardState());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<LoadedState>(() => emptyLoadedState());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const { favorites, removeFavorite } = useFavorites();

  useEffect(() => {
    if (searchMode !== "text") {
      setSuggestions([]);
      return;
    }

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
  }, [query, selectedStation, searchMode]);

  useEffect(() => {
    if (!selectedStation) return;
    if (loadedTabs[activeTab]) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, activeTab, loadedTabs]);

  const refresh = async () => {
    if (!selectedStation) return;
    setStatus("Mise a jour des informations voyageurs.");
    setError("");

    try {
      if (activeTab === "announcements") {
        setAnnouncements(await stationAnnouncements(selectedStation.id));
      } else {
        const items = await stationBoard(selectedStation.id, activeTab);
        setBoards((currentBoards) => ({
          ...currentBoards,
          [activeTab]: items,
        }));
      }
      setLoadedTabs((currentLoadedTabs) => ({
        ...currentLoadedTabs,
        [activeTab]: true,
      }));
      const refreshedAt = new Date().toISOString();
      setStatus(`Derniere mise à jour : ${formatTime(refreshedAt)}`);
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

  const visibleBoard = useMemo(() => {
    if (activeTab === "announcements") return [];
    return boards[activeTab];
  }, [activeTab, boards]);

  const clearStationSelection = () => {
    setSelectedStation(null);
    setQuery("");
    setBoards(emptyBoardState());
    setAnnouncements([]);
    setLoadedTabs(emptyLoadedState());
    setActiveTab("departures");
  };

  const selectStation = (station: Station) => {
    setSelectedStation(station);
    setQuery(station.name);
    setSuggestions([]);
    setBoards(emptyBoardState());
    setAnnouncements([]);
    setLoadedTabs(emptyLoadedState());
    setActiveTab("departures");
  };

  return (
    <div className="page">
      <header className="app-header">
        {!selectedStation && <h1 className="sr-only">SNCF</h1>}
        <div className="app-header-main">
          {selectedStation ? (
            <div className="current-station-row">
              <h1 className="current-station-name">{selectedStation.name}</h1>
              <button
                className="icon-button compact-button"
                type="button"
                aria-label="Supprimer la gare selectionnee"
                onClick={clearStationSelection}
              >
                <span className="button-content">
                  <X aria-hidden="true" />
                  <span>Changer</span>
                </span>
              </button>
            </div>
          ) : (
            <div className="search-mode-tabs" role="tablist" aria-label="Methode de recherche">
              {(["text", "nearby", "favorites"] as const).map((mode) => (
                <button
                  key={mode}
                  className="tab"
                  type="button"
                  role="tab"
                  aria-selected={searchMode === mode}
                  onClick={() => {
                    setSearchMode(mode);
                    setSuggestions([]);
                    setError("");
                    setStatus("");
                  }}
                >
                  {mode === "text" ? "Saisie" : mode === "nearby" ? "Autour" : "Favoris"}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStation && (
          <nav className="header-action-bar" aria-label="Actions de gare">
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
          </nav>
        )}

        <p className={error ? "status error" : "status"} role="status" aria-live="polite">
          {error || status}
        </p>

      </header>

      {!selectedStation && (
        <section className="search-mode-panel" aria-label={searchModeLabel[searchMode]}>
          {searchMode === "text" && (
            <div className="search-block" role="search">
              <div className="search-row">
                <label className="sr-only" htmlFor="station-search">
                  Nom de gare
                </label>
                <Search className="input-icon" aria-hidden="true" />
                <input
                  id="station-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher une gare"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {searchMode === "nearby" && (
            <button className="button-secondary" type="button" onClick={findNearby}>
              <span className="button-content">
                <span>Rechercher autour de moi</span>
              </span>
            </button>
          )}

          {searchMode === "favorites" && (
            <>
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
            </>
          )}

          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <ul className="suggestions" aria-label="Suggestions de gares">
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
            </div>
          )}
        </section>
      )}

      {!selectedStation && <div className="empty-results-panel" aria-hidden="true" />}

      {selectedStation && (
        <section className="station-content" aria-label={`Informations de ${selectedStation.name}`}>

          {activeTab === "announcements" ? (
            <AnnouncementList announcements={announcements} />
          ) : (
            <BoardList items={visibleBoard} type={activeTab} />
          )}
        </section>
      )}
    </div>
  );
}

function BoardList({ items, type }: { items: BoardItem[]; type: BoardType }) {
  if (items.length === 0) return <p className="muted">Aucune information a afficher pour le moment.</p>;

  return (
    <ul className="board-list" aria-label={type === "departures" ? "Tableau des departs" : "Tableau des arrivees"}>
      {items.map((item, index) => (
        <li className="board-item" key={`${type}-${item.id}-${index}`}>
          <div className="board-topline">
            <div>
              <p className="destination">
                {type === "arrivals" ? item.origin ?? "Gare de depart non communiquee" : item.destination}
              </p>
              <p className="muted">{item.line ?? "Ligne non communiquee"}</p>
            </div>
            <time className="time" dateTime={item.expectedTime ?? item.time}>
              {formatTime(item.expectedTime ?? item.time)}
            </time>
          </div>
          <div className="meta">
            <span className="tag">
              {type === "arrivals"
                ? `Depart ${item.origin ?? "non communique"}`
                : `Destination ${item.destination}`}
            </span>
            {item.trainNumber && <span className="tag">Train {item.trainNumber}</span>}
            <span className="tag">Voie {item.platform ?? "non communiquee"}</span>
            <span className={`tag ${item.status === "cancelled" ? "danger" : item.status === "delayed" || item.status === "disrupted" ? "warning" : ""}`}>
              <span className="tag-content">
                <StatusIcon status={item.status} />
                <span>{statusLabel[item.status]}</span>
              </span>
            </span>
          </div>
          {item.disruptions.map((disruption, index) => (
            <p className="muted" key={`${disruption.id}-${index}`}>
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
      {announcements.map((announcement, index) => (
        <li className="announcement" key={`${announcement.id}-${index}`} data-priority={announcement.priority}>
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
