export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Station = {
  id: string;
  name: string;
  city?: string;
  coordinates?: Coordinates;
  source: "sncf";
  distanceMeters?: number;
};

export type BoardType = "departures" | "arrivals";

export type BoardQuery = {
  fromDateTime?: string;
  page?: number;
  count?: number;
};

export type TrainStatus =
  | "on_time"
  | "delayed"
  | "cancelled"
  | "disrupted"
  | "unknown";

export type Disruption = {
  id: string;
  title: string;
  message?: string;
  severity?: string;
};

export type BoardItem = {
  id: string;
  time: string;
  expectedTime?: string;
  destination: string;
  origin?: string;
  servedStations?: string[];
  coachPositions?: Array<{
    coachNumber: string;
    marker: string;
  }>;
  line?: string;
  trainNumber?: string;
  platform?: string;
  status: TrainStatus;
  disruptions: Disruption[];
};

export type AnnouncementPriority = "critical" | "warning" | "info";

export type Announcement = {
  id: string;
  priority: AnnouncementPriority;
  text: string;
  relatedTrainId?: string;
  updatedAt: string;
};
