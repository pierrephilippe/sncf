"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock3,
  Info,
  Megaphone,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";
import { nearbyStations, searchStations, stationAnnouncements, stationBoard } from "./apiClient";
import { useFavorites } from "./useFavorites";

type Tab = BoardType | "announcements";
type SearchMode = "text" | "nearby" | "favorites";
type BoardState = Record<BoardType, BoardItem[]>;
type AnnouncementState = Announcement[];
type LoadedState = Record<Tab, boolean>;
type PagingState = Record<Tab, {
  fromDateTime: string | null;
  page: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}>;
type TrackedTrain = {
  station: Station;
  type: BoardType;
  item: BoardItem;
  updatedAt: string;
};
type NavigationState = {
  selectedStation: Station | null;
  activeTab: Tab;
  searchMode: SearchMode;
  query: string;
  trackedTrain: TrackedTrain | null;
};

const PAGE_SIZE = 20;
const NAVIGATION_STORAGE_KEY = "sncf-accessibilite:navigation";

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

const emptyPagingState = (): PagingState => ({
  departures: { fromDateTime: null, page: 0, hasMore: false, isLoadingMore: false },
  arrivals: { fromDateTime: null, page: 0, hasMore: false, isLoadingMore: false },
  announcements: { fromDateTime: null, page: 0, hasMore: false, isLoadingMore: false },
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

const sameTrain = (trackedItem: BoardItem, candidate: BoardItem): boolean => {
  if (candidate.id === trackedItem.id) return true;
  if (!trackedItem.trainNumber || candidate.trainNumber !== trackedItem.trainNumber) return false;
  return candidate.time === trackedItem.time || candidate.expectedTime === trackedItem.expectedTime;
};

const delayMinutes = (item: BoardItem): number | null => {
  if (!item.expectedTime) return null;
  const delay = Math.round((new Date(item.expectedTime).getTime() - new Date(item.time).getTime()) / 60000);
  return delay > 0 ? delay : null;
};

const initialBoardDateTime = (): string => new Date(Date.now() - 5 * 60 * 1000).toISOString();

const mergeById = <T extends { id: string }>(current: T[], next: T[]): T[] => {
  const knownIds = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !knownIds.has(item.id))];
};

const normalizeStationName = (value: string | undefined): string =>
  value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/^gare\s+(de|d')\s+/i, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-FR") ?? "";

const sameStationName = (left: string | undefined, right: string | undefined): boolean => {
  const normalizedLeft = normalizeStationName(left);
  const normalizedRight = normalizeStationName(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

const knownDifferentStation = (candidate: string | undefined, stationName: string): string | undefined => {
  if (!candidate || sameStationName(candidate, stationName)) return undefined;
  return candidate;
};

const splitRouteLabel = (routeLabel: string | undefined): [string, string] | null => {
  const parts = routeLabel?.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);
  if (!parts || parts.length < 2) return null;
  return [parts[0], parts[parts.length - 1]];
};

const isStation = (value: unknown): value is Station =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  "name" in value &&
  "source" in value &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  value.source === "sncf";

const isTab = (value: unknown): value is Tab =>
  value === "departures" || value === "arrivals" || value === "announcements";

const isBoardType = (value: unknown): value is BoardType =>
  value === "departures" || value === "arrivals";

const isSearchMode = (value: unknown): value is SearchMode =>
  value === "text" || value === "nearby" || value === "favorites";

const isBoardItem = (value: unknown): value is BoardItem =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  "time" in value &&
  "status" in value &&
  "disruptions" in value &&
  typeof value.id === "string" &&
  typeof value.time === "string" &&
  Array.isArray(value.disruptions);

const isTrackedTrain = (value: unknown): value is TrackedTrain => {
  if (typeof value !== "object" || value === null) return false;
  const tracked = value as Partial<TrackedTrain>;
  return isStation(tracked.station) &&
    isBoardType(tracked.type) &&
    isBoardItem(tracked.item) &&
    typeof tracked.updatedAt === "string";
};

const readNavigationState = (): NavigationState | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<NavigationState>;
    const selectedStation = parsed.selectedStation === null || parsed.selectedStation === undefined
      ? null
      : isStation(parsed.selectedStation) ? parsed.selectedStation : null;
    const trackedTrain = parsed.trackedTrain === null || parsed.trackedTrain === undefined
      ? null
      : isTrackedTrain(parsed.trackedTrain) ? parsed.trackedTrain : null;

    return {
      selectedStation: trackedTrain?.station ?? selectedStation,
      activeTab: trackedTrain?.type ?? (isTab(parsed.activeTab) ? parsed.activeTab : "departures"),
      searchMode: isSearchMode(parsed.searchMode) ? parsed.searchMode : "text",
      query: typeof parsed.query === "string" ? parsed.query : selectedStation?.name ?? "",
      trackedTrain,
    };
  } catch {
    window.localStorage.removeItem(NAVIGATION_STORAGE_KEY);
    return null;
  }
};

const writeNavigationState = (state: NavigationState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(state));
};

export function AccessibleStationApp() {
  const [initialNavigation] = useState<NavigationState | null>(() => readNavigationState());
  const [query, setQuery] = useState(initialNavigation?.query ?? "");
  const [suggestions, setSuggestions] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(initialNavigation?.selectedStation ?? null);
  const [activeTab, setActiveTab] = useState<Tab>(initialNavigation?.activeTab ?? "departures");
  const [boards, setBoards] = useState<BoardState>(() => emptyBoardState());
  const [announcements, setAnnouncements] = useState<AnnouncementState>([]);
  const [loadedTabs, setLoadedTabs] = useState<LoadedState>(() => emptyLoadedState());
  const [paging, setPaging] = useState<PagingState>(() => emptyPagingState());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>(initialNavigation?.searchMode ?? "text");
  const [trackedTrain, setTrackedTrain] = useState<TrackedTrain | null>(initialNavigation?.trackedTrain ?? null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

  useEffect(() => {
    writeNavigationState({
      selectedStation,
      activeTab,
      searchMode,
      query,
      trackedTrain,
    });
  }, [selectedStation, activeTab, searchMode, query, trackedTrain]);

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

  useEffect(() => {
    if (!selectedStation || trackedTrain) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, { rootMargin: "240px" });

    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, trackedTrain, activeTab, paging]);

  const refresh = async () => {
    if (!selectedStation) return;
    setStatus("Mise a jour des informations voyageurs.");
    setError("");

    try {
      const fromDateTime = initialBoardDateTime();
      if (activeTab === "announcements") {
        const items = await stationAnnouncements(selectedStation.id, { fromDateTime, page: 0 });
        setAnnouncements(items);
        setPaging((currentPaging) => ({
          ...currentPaging,
          announcements: {
            fromDateTime,
            page: 0,
            hasMore: items.length === PAGE_SIZE,
            isLoadingMore: false,
          },
        }));
      } else {
        const items = await stationBoard(selectedStation.id, activeTab, { fromDateTime, page: 0 });
        setBoards((currentBoards) => ({
          ...currentBoards,
          [activeTab]: items,
        }));
        setPaging((currentPaging) => ({
          ...currentPaging,
          [activeTab]: {
            fromDateTime,
            page: 0,
            hasMore: items.length === PAGE_SIZE,
            isLoadingMore: false,
          },
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

  const loadMore = async () => {
    if (!selectedStation || trackedTrain) return;

    const currentPaging = paging[activeTab];
    if (!currentPaging.hasMore || currentPaging.isLoadingMore) return;

    const fromDateTime = currentPaging.fromDateTime ?? initialBoardDateTime();
    const nextPage = currentPaging.page + 1;

    setPaging((state) => ({
      ...state,
      [activeTab]: {
        ...state[activeTab],
        isLoadingMore: true,
      },
    }));
    setError("");

    try {
      if (activeTab === "announcements") {
        const items = await stationAnnouncements(selectedStation.id, { fromDateTime, page: nextPage });
        const mergedAnnouncements = mergeById(announcements, items);
        const addedItemCount = mergedAnnouncements.length - announcements.length;
        setAnnouncements(mergedAnnouncements);
        setPaging((state) => ({
          ...state,
          announcements: {
            fromDateTime,
            page: nextPage,
            hasMore: items.length === PAGE_SIZE && addedItemCount > 0,
            isLoadingMore: false,
          },
        }));
      } else {
        const items = await stationBoard(selectedStation.id, activeTab, { fromDateTime, page: nextPage });
        const mergedBoard = mergeById(boards[activeTab], items);
        const addedItemCount = mergedBoard.length - boards[activeTab].length;
        setBoards((currentBoards) => ({
          ...currentBoards,
          [activeTab]: mergedBoard,
        }));
        setPaging((state) => ({
          ...state,
          [activeTab]: {
            fromDateTime,
            page: nextPage,
            hasMore: items.length === PAGE_SIZE && addedItemCount > 0,
            isLoadingMore: false,
          },
        }));
      }
    } catch (cause) {
      setError(readableError(cause, "Chargement des informations suivantes indisponible. Reessayez dans quelques instants."));
      setPaging((state) => ({
        ...state,
        [activeTab]: {
          ...state[activeTab],
          isLoadingMore: false,
        },
      }));
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
    setPaging(emptyPagingState());
    setTrackedTrain(null);
    setActiveTab("departures");
  };

  const selectStation = (station: Station) => {
    setSelectedStation(station);
    setQuery(station.name);
    setSuggestions([]);
    setBoards(emptyBoardState());
    setAnnouncements([]);
    setLoadedTabs(emptyLoadedState());
    setPaging(emptyPagingState());
    setTrackedTrain(null);
    setActiveTab("departures");
  };

  const followTrain = (item: BoardItem, type: BoardType) => {
    if (!selectedStation) return;
    setTrackedTrain({
      station: selectedStation,
      type,
      item,
      updatedAt: new Date().toISOString(),
    });
    setStatus(`Suivi du train ${item.trainNumber ?? "selectionne"} active.`);
    setError("");
  };

  const refreshTrackedTrain = async () => {
    if (!trackedTrain) return;

    setStatus("Mise a jour du suivi du train.");
    setError("");

    try {
      const items = await stationBoard(trackedTrain.station.id, trackedTrain.type);
      setBoards((currentBoards) => ({
        ...currentBoards,
        [trackedTrain.type]: items,
      }));
      setLoadedTabs((currentLoadedTabs) => ({
        ...currentLoadedTabs,
        [trackedTrain.type]: true,
      }));

      const refreshedItem = items.find((item) => sameTrain(trackedTrain.item, item));
      const refreshedAt = new Date().toISOString();
      if (!refreshedItem) {
        setTrackedTrain({ ...trackedTrain, updatedAt: refreshedAt });
        setStatus("Train non retrouve dans les prochaines informations. Il peut etre parti, arrive ou ne plus etre affiche.");
        return;
      }

      setTrackedTrain({
        ...trackedTrain,
        item: refreshedItem,
        updatedAt: refreshedAt,
      });
      setStatus(`Derniere mise à jour : ${formatTime(refreshedAt)}`);
    } catch (cause) {
      setError(readableError(cause, "Suivi du train indisponible. Reessayez dans quelques instants."));
      setStatus("");
    }
  };

  return (
    <div className="page">
      <header className="app-header">
        {!selectedStation && <h1 className="sr-only">SNCF</h1>}
        <div className="app-header-main">
          {selectedStation ? (
            <div className="current-station-row">
              <h1 className="current-station-name">{selectedStation.name}</h1>
              {!isFavorite(selectedStation.id) && (
                <button
                  className="icon-button compact-button"
                  type="button"
                  aria-label={`Ajouter ${selectedStation.name} aux favoris`}
                  onClick={() => addFavorite(selectedStation)}
                >
                  <span className="button-content">
                    <Star aria-hidden="true" />
                    <span>Favori</span>
                  </span>
                </button>
              )}
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

        {selectedStation && !trackedTrain && (
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

          {trackedTrain ? (
            <TrainTrackingView
              trackedTrain={trackedTrain}
              onBack={() => setTrackedTrain(null)}
              onRefresh={refreshTrackedTrain}
            />
          ) : activeTab === "announcements" ? (
            <AnnouncementList announcements={announcements} />
          ) : (
            <BoardList items={visibleBoard} type={activeTab} onFollow={followTrain} />
          )}

          {!trackedTrain && loadedTabs[activeTab] && (
            <div className="load-more" ref={loadMoreRef}>
              {paging[activeTab].hasMore ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={paging[activeTab].isLoadingMore}
                  onClick={loadMore}
                >
                  {paging[activeTab].isLoadingMore ? "Chargement en cours" : "Charger plus"}
                </button>
              ) : (
                <p className="muted">Tous les resultats disponibles sont affiches.</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function BoardList({
  items,
  type,
  onFollow,
}: {
  items: BoardItem[];
  type: BoardType;
  onFollow: (item: BoardItem, type: BoardType) => void;
}) {
  if (items.length === 0) return <p className="muted">Aucune information a afficher pour le moment.</p>;

  return (
    <ul className="board-list" aria-label={type === "departures" ? "Tableau des departs" : "Tableau des arrivees"}>
      {items.map((item, index) => (
        <li className="board-item" key={`${type}-${item.id}-${index}`}>
          <div className="board-topline">
            <div>
              <p className="destination">
                {type === "arrivals"
                  ? item.origin ?? "Gare de depart non communiquee"
                  : item.destination ?? "Destination non communiquee"}
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
                : `Destination ${item.destination ?? "non communiquee"}`}
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
          <button
            className="button-secondary train-follow-button"
            type="button"
            onClick={() => onFollow(item, type)}
          >
            <span className="button-content">
              <Bell aria-hidden="true" />
              <span>{item.trainNumber ? `Suivre le train ${item.trainNumber}` : "Suivre ce train"}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TrainTrackingView({
  trackedTrain,
  onBack,
  onRefresh,
}: {
  trackedTrain: TrackedTrain;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const { item, type, station, updatedAt } = trackedTrain;
  const firstServedStation = item.servedStations?.[0];
  const lastServedStation = item.servedStations?.at(-1);
  const routeLabelPlaces = splitRouteLabel(item.routeLabel);
  const departurePlace = type === "arrivals"
    ? knownDifferentStation(firstServedStation, station.name) ??
      knownDifferentStation(routeLabelPlaces?.[0], station.name) ??
      knownDifferentStation(item.origin, station.name)
    : station.name;
  const arrivalPlace = type === "arrivals"
    ? station.name
    : knownDifferentStation(lastServedStation, station.name) ??
      knownDifferentStation(routeLabelPlaces?.[1], station.name) ??
      knownDifferentStation(item.destination, station.name);
  const trainName = [item.line, item.trainNumber ? `Train ${item.trainNumber}` : undefined]
    .filter(Boolean)
    .join(" - ") || "Train suivi";
  const delay = delayMinutes(item);
  const hasRealtimeTime = Boolean(item.expectedTime && item.expectedTime !== item.time);
  const hasImportantInformation =
    item.status === "delayed" ||
    item.status === "cancelled" ||
    item.status === "disrupted" ||
    item.disruptions.length > 0;

  return (
    <article className="train-tracking" aria-labelledby="train-tracking-title">
      <div className="tracking-actions">
        <button className="button-secondary compact-button" type="button" onClick={onBack}>
          <span className="button-content">
            <ArrowLeft aria-hidden="true" />
            <span>Retour</span>
          </span>
        </button>
        <button className="button-secondary compact-button" type="button" onClick={onRefresh}>
          <span className="button-content">
            <RefreshCw aria-hidden="true" />
            <span>Actualiser</span>
          </span>
        </button>
      </div>

      <header className="tracking-header">
        <div className="tracking-train-identity" aria-label="Train">
          <h2>{trainName}</h2>
        </div>
        <div className="tracking-route-cards" aria-labelledby="train-tracking-title">
          <div className="tracking-route-card">
            <span>Depart</span>
            <strong id="train-tracking-title">{departurePlace ?? "Non communique"}</strong>
          </div>
          <div className="tracking-route-card">
            <span>Arrivee</span>
            <strong>{arrivalPlace ?? "Non communique"}</strong>
          </div>
        </div>
      </header>

      <div className="tracking-summary-cards">
        <div className="tracking-summary-card" aria-label={type === "arrivals" ? "Heure d'arrivee" : "Heure de depart"}>
          <span>
            {type === "arrivals"
              ? hasRealtimeTime ? "Arrivee retardee" : "Arrivee"
              : hasRealtimeTime ? "Depart retarde" : "Depart"}
          </span>
          {hasRealtimeTime && (
            <time className="original-time" dateTime={item.time}>{formatTime(item.time)}</time>
          )}
          <time dateTime={item.expectedTime ?? item.time}>{formatTime(item.expectedTime ?? item.time)}</time>
        </div>
        <div className="tracking-summary-card" aria-label="Voie du train">
          <span>Voie</span>
          <strong>{item.platform ?? "NC"}</strong>
        </div>
        <div className="tracking-summary-card" aria-label="Statut du train">
          <span>Status</span>
          <strong className="status-summary">
            <StatusIcon status={item.status} />
            <span>{statusLabel[item.status]}</span>
          </strong>
        </div>
      </div>

      {hasImportantInformation && (
        <section className="tracking-alert" aria-label="Informations importantes du train">
          <p className="tracking-alert-title">
            <StatusIcon status={item.status} />
            <span>{statusLabel[item.status]}</span>
          </p>
          {delay !== null && <p>Retard estime : {delay} minutes.</p>}
          {item.status === "cancelled" && <p>Ce train est indique comme supprime.</p>}
          {item.status === "disrupted" && item.disruptions.length === 0 && (
            <p>Une perturbation est indiquee pour ce train.</p>
          )}
          {item.disruptions.map((disruption, index) => (
            <p key={`${disruption.id}-alert-${index}`}>
              <strong>{disruption.title}</strong>
              {disruption.message ? ` - ${disruption.message}` : ""}
            </p>
          ))}
        </section>
      )}

      <p className="tracking-updated-at">
        Derniere actualisation : <time dateTime={updatedAt}>{formatTime(updatedAt)}</time>
      </p>

      {type === "departures" && item.servedStations && item.servedStations.length > 0 && (
        <section className="tracking-section" aria-label="Gares desservies">
          <h3>Gares desservies</h3>
          <ol className="served-stations">
            {item.servedStations.map((stationName, index) => (
              <li key={`${stationName}-${index}`}>{stationName}</li>
            ))}
          </ol>
        </section>
      )}

      {item.coachPositions && item.coachPositions.length > 0 && (
        <section className="tracking-section" aria-label="Plan voitures et reperes">
          <h3>Plan voitures et reperes</h3>
          <ul className="coach-position-list">
            {item.coachPositions.map((coach) => (
              <li key={`${coach.coachNumber}-${coach.marker}`}>
                Voiture {coach.coachNumber} - Repere {coach.marker}
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.disruptions.length > 0 && (
        <section className="tracking-disruptions" aria-label="Perturbations du train">
          <h3>Perturbations</h3>
          {item.disruptions.map((disruption, index) => (
            <p key={`${disruption.id}-${index}`}>
              <strong>{disruption.title}</strong>
              {disruption.message ? ` - ${disruption.message}` : ""}
            </p>
          ))}
        </section>
      )}
    </article>
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
