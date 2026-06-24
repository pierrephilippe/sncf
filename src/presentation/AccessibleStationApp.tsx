"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";
import { nearbyStations, searchStations, stationAnnouncements, stationBoard, trainDetails } from "./apiClient";
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
  isTrainDetailsOpen: boolean;
};

const PAGE_SIZE = 20;
const TRACKED_TRAIN_POLL_INTERVAL_MS = 60_000;
const NAVIGATION_STORAGE_KEY = "sncf-accessibilite:navigation";
const OFFICIAL_SNCF_GARES_URL = "https://www.garesetconnexions.sncf/fr/gares-services/";

const searchModeLabel: Record<SearchMode, string> = {
  text: "Recherche par saisie",
  nearby: "Recherche autour",
  favorites: "Sélection de favoris",
};

const formatTime = (isoDate: string): string =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(isoDate));

const statusLabel: Record<BoardItem["status"], string> = {
  on_time: "À l'heure",
  delayed: "Retard",
  cancelled: "Supprimé",
  disrupted: "Perturbé",
  unknown: "Non confirme",
};

const priorityLabel: Record<Announcement["priority"], string> = {
  critical: "Priorite haute",
  warning: "À surveiller",
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

const initialBoardDateTime = (): string => new Date().toISOString();

const mergeById = <T extends { id: string }>(current: T[], next: T[]): T[] => {
  const knownIds = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !knownIds.has(item.id))];
};

const mergeTrainDetails = (item: BoardItem, details: Partial<BoardItem>): BoardItem => ({
  ...item,
  ...(details.servedStations && details.servedStations.length > 0 ? { servedStations: details.servedStations } : {}),
  ...(details.routeLabel ? { routeLabel: details.routeLabel } : {}),
});

const boardItemUpdateSignature = (item: BoardItem): string => JSON.stringify({
  id: item.id,
  vehicleJourneyId: item.vehicleJourneyId,
  time: item.time,
  expectedTime: item.expectedTime,
  destination: item.destination,
  origin: item.origin,
  servedStations: item.servedStations ?? [],
  coachPositions: item.coachPositions ?? [],
  line: item.line,
  routeLabel: item.routeLabel,
  trainNumber: item.trainNumber,
  platform: item.platform,
  status: item.status,
  disruptions: item.disruptions.map((disruption) => ({
    id: disruption.id,
    title: disruption.title,
    message: disruption.message,
    severity: disruption.severity,
  })),
});

const hasTrackedTrainChanged = (currentItem: BoardItem, nextItem: BoardItem): boolean =>
  boardItemUpdateSignature(currentItem) !== boardItemUpdateSignature(nextItem);

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
      isTrainDetailsOpen: Boolean(trackedTrain && parsed.isTrainDetailsOpen !== false),
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
  const [hasRestoredNavigation, setHasRestoredNavigation] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("departures");
  const [boards, setBoards] = useState<BoardState>(() => emptyBoardState());
  const [announcements, setAnnouncements] = useState<AnnouncementState>([]);
  const [loadedTabs, setLoadedTabs] = useState<LoadedState>(() => emptyLoadedState());
  const [paging, setPaging] = useState<PagingState>(() => emptyPagingState());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const [trackedTrain, setTrackedTrain] = useState<TrackedTrain | null>(null);
  const [isTrainDetailsOpen, setIsTrainDetailsOpen] = useState(false);
  const [trackedTrainUpdateAvailable, setTrackedTrainUpdateAvailable] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const attemptedTrainDetailsRef = useRef<Set<string>>(new Set());
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();
  const isLoading = pendingRequestCount > 0;
  const startLoading = useCallback(() => {
    setPendingRequestCount((count) => count + 1);
  }, []);
  const stopLoading = useCallback(() => {
    setPendingRequestCount((count) => Math.max(0, count - 1));
  }, []);

  useEffect(() => {
    if (hasRestoredNavigation) return;
    const restoredNavigation = readNavigationState();
    if (restoredNavigation) {
      setQuery(restoredNavigation.query);
      setSelectedStation(restoredNavigation.selectedStation);
      setActiveTab(restoredNavigation.activeTab);
      setSearchMode(restoredNavigation.searchMode);
      setTrackedTrain(restoredNavigation.trackedTrain);
      setIsTrainDetailsOpen(restoredNavigation.isTrainDetailsOpen);
    }
    setHasRestoredNavigation(true);
  }, [hasRestoredNavigation]);

  useEffect(() => {
    if (!hasRestoredNavigation) return;
    writeNavigationState({
      selectedStation,
      activeTab,
      searchMode,
      query,
      trackedTrain,
      isTrainDetailsOpen,
    });
  }, [hasRestoredNavigation, selectedStation, activeTab, searchMode, query, trackedTrain, isTrainDetailsOpen]);

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
      startLoading();
      setStatus("Recherche des gares en cours.");
      setError("");
      try {
        setSuggestions(await searchStations(query));
        setStatus("Suggestions mises à jour.");
      } catch (cause) {
        setError(readableError(cause, "Recherche indisponible. Réessayez dans quelques instants."));
        setStatus("");
      } finally {
        stopLoading();
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query, selectedStation, searchMode, startLoading, stopLoading]);

  useEffect(() => {
    if (!selectedStation) return;
    if (loadedTabs[activeTab]) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, activeTab, loadedTabs]);

  useEffect(() => {
    if (!selectedStation || isTrainDetailsOpen) return;
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
  }, [selectedStation, isTrainDetailsOpen, activeTab, paging]);

  useEffect(() => {
    const vehicleJourneyId = trackedTrain?.item.vehicleJourneyId;
    if (!vehicleJourneyId || attemptedTrainDetailsRef.current.has(vehicleJourneyId)) return;

    attemptedTrainDetailsRef.current.add(vehicleJourneyId);

    const enrichTrackedTrain = async () => {
      startLoading();
      try {
        const details = await trainDetails(vehicleJourneyId);
        setTrackedTrain((currentTrackedTrain) => currentTrackedTrain?.item.vehicleJourneyId === vehicleJourneyId
          ? {
              ...currentTrackedTrain,
              item: mergeTrainDetails(currentTrackedTrain.item, details),
            }
          : currentTrackedTrain);
      } catch (cause) {
        setError(readableError(cause, "Détail du train indisponible. Les informations affichées restent celles du tableau."));
        setStatus("");
      } finally {
        stopLoading();
      }
    };

    void enrichTrackedTrain();
  }, [trackedTrain?.item.vehicleJourneyId, startLoading, stopLoading]);

  const refresh = async () => {
    if (!selectedStation) return;
    startLoading();
    setStatus("Mise à jour des informations voyageurs.");
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
      setStatus(`Dernière mise à jour : ${formatTime(refreshedAt)}`);
    } catch (cause) {
      setError(readableError(cause, "Informations indisponibles. Réessayez dans quelques instants."));
      setStatus("");
    } finally {
      stopLoading();
    }
  };

  const loadMore = async () => {
    if (!selectedStation || isTrainDetailsOpen) return;

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
    startLoading();

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
      setError(readableError(cause, "Chargement des informations suivantes indisponible. Réessayez dans quelques instants."));
      setPaging((state) => ({
        ...state,
        [activeTab]: {
          ...state[activeTab],
          isLoadingMore: false,
        },
      }));
    } finally {
      stopLoading();
    }
  };

  const findNearby = () => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }

    setStatus("Recherche des gares autour de vous.");
    setError("");
    startLoading();
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const stations = await nearbyStations(position.coords.latitude, position.coords.longitude);
          setSuggestions(stations);
          setStatus(stations.length ? "Gares proches trouvées." : "Aucune gare proche trouvée.");
        } catch (cause) {
          setError(readableError(cause, "Recherche autour de vous indisponible. Réessayez dans quelques instants."));
          setStatus("");
        } finally {
          stopLoading();
        }
      },
      () => {
        setError("Autorisation de géolocalisation refusée ou position indisponible.");
        setStatus("");
        stopLoading();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  const visibleBoard = useMemo(() => {
    if (activeTab === "announcements") return [];
    return boards[activeTab];
  }, [activeTab, boards]);
  const isInitialTabLoading = Boolean(selectedStation && !isTrainDetailsOpen && !loadedTabs[activeTab] && !error);

  const clearStationSelection = () => {
    setSelectedStation(null);
    setQuery("");
    setBoards(emptyBoardState());
    setAnnouncements([]);
    setLoadedTabs(emptyLoadedState());
    setPaging(emptyPagingState());
    setTrackedTrain(null);
    setIsTrainDetailsOpen(false);
    setTrackedTrainUpdateAvailable(false);
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
    setIsTrainDetailsOpen(false);
    setTrackedTrainUpdateAvailable(false);
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
    setActiveTab(type);
    setIsTrainDetailsOpen(true);
    setTrackedTrainUpdateAvailable(false);
    setStatus(`Suivi du train ${item.trainNumber ?? "sélectionné"} activé.`);
    setError("");
  };

  const fetchTrackedTrainSnapshot = useCallback(async (currentTrackedTrain: TrackedTrain) => {
    const items = await stationBoard(currentTrackedTrain.station.id, currentTrackedTrain.type);
    const refreshedAt = new Date().toISOString();
    const refreshedItem = items.find((item) => sameTrain(currentTrackedTrain.item, item));

    if (!refreshedItem) {
      return { items, item: null, refreshedAt };
    }

    const vehicleJourneyId = refreshedItem.vehicleJourneyId ?? currentTrackedTrain.item.vehicleJourneyId;
    const itemWithVehicleJourney = vehicleJourneyId
      ? { ...refreshedItem, vehicleJourneyId }
      : refreshedItem;
    const enrichedItem = vehicleJourneyId
      ? mergeTrainDetails(itemWithVehicleJourney, await trainDetails(vehicleJourneyId))
      : itemWithVehicleJourney;

    return { items, item: enrichedItem, refreshedAt };
  }, []);

  useEffect(() => {
    if (!trackedTrain) {
      setTrackedTrainUpdateAvailable(false);
      return;
    }

    let isCancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const snapshot = await fetchTrackedTrainSnapshot(trackedTrain);
        if (isCancelled) return;

        setTrackedTrainUpdateAvailable(!snapshot.item || hasTrackedTrainChanged(trackedTrain.item, snapshot.item));
      } catch {
        // La vérification de fond ne doit pas remplacer les informations déjà affichées.
      }
    }, TRACKED_TRAIN_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchTrackedTrainSnapshot, trackedTrain]);

  const openTrackedTrainDetails = useCallback(() => {
    if (!trackedTrain) return;
    setActiveTab(trackedTrain.type);
    setIsTrainDetailsOpen(true);
    window.setTimeout(() => {
      document.getElementById("train-tracking-title")?.scrollIntoView({ block: "start" });
    }, 0);
  }, [trackedTrain]);

  const refreshTrackedTrain = async () => {
    if (!trackedTrain) return;

    startLoading();
    setStatus("Mise à jour du suivi du train.");
    setError("");

    try {
      const snapshot = await fetchTrackedTrainSnapshot(trackedTrain);
      setBoards((currentBoards) => ({
        ...currentBoards,
        [trackedTrain.type]: snapshot.items,
      }));
      setLoadedTabs((currentLoadedTabs) => ({
        ...currentLoadedTabs,
        [trackedTrain.type]: true,
      }));

      setTrackedTrainUpdateAvailable(false);
      if (!snapshot.item) {
        setTrackedTrain({ ...trackedTrain, updatedAt: snapshot.refreshedAt });
        setStatus("Train non retrouvé dans les prochaines informations. Il peut être parti, arrivé ou ne plus être affiché.");
        return;
      }

      setTrackedTrain({
        ...trackedTrain,
        item: snapshot.item,
        updatedAt: snapshot.refreshedAt,
      });
      setStatus(`Dernière mise à jour : ${formatTime(snapshot.refreshedAt)}`);
    } catch (cause) {
      setError(readableError(cause, "Suivi du train indisponible. Réessayez dans quelques instants."));
      setStatus("");
    } finally {
      stopLoading();
    }
  };

  const trackedTrainLabel = trackedTrain?.item.trainNumber ?? "sélectionné";
  const trackingStatusButtonText = trackedTrainUpdateAvailable
    ? `Voir les nouvelles infos du train ${trackedTrainLabel}`
    : `Voir le train ${trackedTrainLabel} suivi`;

  return (
    <div className="page">
      <header className="app-header">
        {!selectedStation && <h1 className="sr-only">SNCFady</h1>}
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
                aria-label="Supprimer la gare sélectionnée"
                onClick={clearStationSelection}
              >
                <span className="button-content">
                  <X aria-hidden="true" />
                  <span>Changer</span>
                </span>
              </button>
            </div>
          ) : (
            <div className="search-mode-tabs" role="tablist" aria-label="Méthode de recherche">
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

        {selectedStation && !isTrainDetailsOpen && (
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
                Départs
              </button>
              <button
                className="tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "arrivals"}
                onClick={() => setActiveTab("arrivals")}
              >
                Arrivées
              </button>
              <button
                className="tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "announcements"}
                onClick={() => setActiveTab("announcements")}
              >
                Alertes
              </button>
            </div>
          </nav>
        )}

        <div className="status" role="status" aria-live="polite">
          {isLoading ? (
            <span className="loading-status">
              <span className="loading-spinner" aria-hidden="true" />
              <span>Chargement en cours</span>
            </span>
          ) : trackedTrain && !isTrainDetailsOpen ? (
            <button
              className={trackedTrainUpdateAvailable
                ? "button-secondary compact-button tracking-status-button update-available"
                : "button-secondary compact-button tracking-status-button"}
              type="button"
              onClick={openTrackedTrainDetails}
            >
              <span className="button-content">
                <Clock3 aria-hidden="true" />
                <span>{trackingStatusButtonText}</span>
              </span>
            </button>
          ) : trackedTrain ? (
            ""
          ) : status}
        </div>

      </header>

      {error && !isTrainDetailsOpen && (
        <div className="page-alert">
          <ApiErrorAlert
            title="Service indisponible"
            message={error}
            detail="Aucune nouvelle information n'a pu être récupérée. Réessayez dans quelques instants."
          />
        </div>
      )}

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
                        <span className="muted"> - {Math.round(station.distanceMeters)} mètres</span>
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
          {!isTrainDetailsOpen && (
            <a
              className="button-secondary official-results-link"
              href={OFFICIAL_SNCF_GARES_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span className="button-content">
                <ExternalLink aria-hidden="true" />
                <span>Gares et services SNCF</span>
              </span>
            </a>
          )}

          {trackedTrain && isTrainDetailsOpen ? (
            <TrainTrackingView
              trackedTrain={trackedTrain}
              error={error}
              hasPendingUpdate={trackedTrainUpdateAvailable}
              onBack={() => setIsTrainDetailsOpen(false)}
              onRefresh={refreshTrackedTrain}
            />
          ) : activeTab === "announcements" ? (
            <AnnouncementList announcements={announcements} isLoading={isInitialTabLoading} />
          ) : (
            <BoardList items={visibleBoard} type={activeTab} isLoading={isInitialTabLoading} onFollow={followTrain} />
          )}

          {!isTrainDetailsOpen && loadedTabs[activeTab] && (
            <div className="load-more" ref={loadMoreRef}>
              {paging[activeTab].hasMore ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={paging[activeTab].isLoadingMore}
                  onClick={loadMore}
                >
                  {paging[activeTab].isLoadingMore ? (
                    <span className="button-content">
                      <span className="loading-spinner" aria-hidden="true" />
                      <span>Chargement en cours</span>
                    </span>
                  ) : "Charger plus"}
                </button>
              ) : (
                <p className="muted">Tous les résultats disponibles sont affichés.</p>
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
  isLoading,
  onFollow,
}: {
  items: BoardItem[];
  type: BoardType;
  isLoading: boolean;
  onFollow: (item: BoardItem, type: BoardType) => void;
}) {
  if (isLoading) return <ContentLoadingIndicator />;
  if (items.length === 0) return <p className="muted">Aucune information à afficher pour le moment.</p>;

  return (
    <ul className="board-list" aria-label={type === "departures" ? "Tableau des départs" : "Tableau des arrivées"}>
      {items.map((item, index) => {
        const delay = delayMinutes(item);
        const hasRealtimeTime = Boolean(item.expectedTime && item.expectedTime !== item.time);

        return (
          <li className="board-item" key={`${type}-${item.id}-${index}`}>
            <button
              className="board-card-button"
              type="button"
              aria-label={item.trainNumber ? `Ouvrir le détail du train ${item.trainNumber}` : "Ouvrir le détail du train"}
              onClick={() => onFollow(item, type)}
            >
              <div className="board-topline">
                <div>
                  <p className="destination">
                    {type === "arrivals"
                      ? item.origin ?? "Gare de départ non communiquée"
                      : item.destination ?? "Destination non communiquée"}
                  </p>
                  <p className="muted">{item.line ?? "Ligne non communiquée"}</p>
                </div>
                <div className="board-time">
                  {hasRealtimeTime && (
                    <span className="initial-time">
                      <span className="initial-time-label">Initialement prévue</span>
                      <time className="time original-time" dateTime={item.time}>
                        {formatTime(item.time)}
                      </time>
                      <span className="sr-only">Nouvel horaire </span>
                    </span>
                  )}
                  <time className={hasRealtimeTime ? "time updated-time" : "time"} dateTime={item.expectedTime ?? item.time}>
                    {formatTime(item.expectedTime ?? item.time)}
                  </time>
                </div>
              </div>
              <div className="meta">
                <span className="tag">Voie {item.platform ?? "non communiquée"}</span>
                {delay !== null && (
                  <span className="tag warning">
                    <span className="tag-content">
                      <Clock3 aria-hidden="true" />
                      <span>
                        {type === "arrivals" ? "Arrivée retardée" : "Départ retardé"}
                        {` de ${delay} min`}
                      </span>
                    </span>
                  </span>
                )}
                {item.status !== "delayed" && (
                  <span className={`tag ${item.status === "cancelled" ? "danger" : item.status === "disrupted" ? "warning" : ""}`}>
                    <span className="tag-content">
                      <StatusIcon status={item.status} />
                      <span>{statusLabel[item.status]}</span>
                    </span>
                  </span>
                )}
              </div>
              {item.disruptions.map((disruption, index) => (
                <p className="muted board-disruption" key={`${disruption.id}-${index}`}>
                  {disruption.title}
                </p>
              ))}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ContentLoadingIndicator() {
  return (
    <div className="content-loading" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>Chargement en cours</span>
    </div>
  );
}

function TrainTrackingView({
  trackedTrain,
  error,
  hasPendingUpdate,
  onBack,
  onRefresh,
}: {
  trackedTrain: TrackedTrain;
  error: string;
  hasPendingUpdate: boolean;
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

      {error && (
        <ApiErrorAlert
          message={error}
          detail="Les informations affichées ne sont pas confirmées par une nouvelle mise à jour."
        />
      )}

      <header className="tracking-header">
        <div className="tracking-train-identity" aria-label="Train">
          <h2 id="train-tracking-title">{trainName}</h2>
        </div>
        <div className="tracking-route-cards" aria-labelledby="train-tracking-title">
          <div className="tracking-route-card">
            <span>Départ</span>
            <strong>{departurePlace ?? "Non communiqué"}</strong>
          </div>
          <div className="tracking-route-card">
            <span>Arrivée</span>
            <strong>{arrivalPlace ?? "Non communiqué"}</strong>
          </div>
        </div>
      </header>

      {hasPendingUpdate && (
        <div className="tracking-update-hint" role="status" aria-live="polite">
          <span className="tracking-alert-title">
            <Info aria-hidden="true" />
            <span>Mise à jour disponible</span>
          </span>
          <p>De nouvelles informations sont disponibles. Cliquez sur Actualiser pour les afficher.</p>
        </div>
      )}

      <div className="tracking-summary-cards">
        <div className="tracking-summary-card" aria-label={type === "arrivals" ? "Heure d'arrivée" : "Heure de départ"}>
          <span>
            {type === "arrivals"
              ? hasRealtimeTime ? "Arrivée retardée" : "Arrivée"
              : hasRealtimeTime ? "Départ retardé" : "Départ"}
          </span>
          {hasRealtimeTime && (
            <span className="initial-time">
              <span className="initial-time-label">Initialement prévue</span>
              <time className="original-time" dateTime={item.time}>{formatTime(item.time)}</time>
            </span>
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
          {delay !== null && <p>Retard estimé : {delay} minutes.</p>}
          {item.status === "cancelled" && <p>Ce train est indiqué comme supprimé.</p>}
          {item.status === "disrupted" && item.disruptions.length === 0 && (
            <p>Une perturbation est indiquée pour ce train.</p>
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
        Dernière actualisation : <time dateTime={updatedAt}>{formatTime(updatedAt)}</time>
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

function ApiErrorAlert({
  title = "Actualisation impossible",
  message,
  detail,
}: {
  title?: string;
  message: string;
  detail?: string;
}) {
  return (
    <section className="api-error-alert" role="alert" aria-label={title}>
      <p className="tracking-alert-title">
        <AlertTriangle aria-hidden="true" />
        <span>{title}</span>
      </p>
      <p>{message}</p>
      {detail && <p>{detail}</p>}
    </section>
  );
}

function AnnouncementList({ announcements, isLoading }: { announcements: Announcement[]; isLoading: boolean }) {
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  if (isLoading) return <ContentLoadingIndicator />;
  if (announcements.length === 0) return <p className="muted">Aucune alerte prioritaire pour le moment.</p>;

  return (
    <ul className="announcement-list" aria-label="Alertes textuelles">
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
