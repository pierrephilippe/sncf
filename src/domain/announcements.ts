import type { Announcement, AnnouncementPriority, BoardItem } from "./types";

export interface AnnouncementPriorityStrategy {
  priorityFor(item: BoardItem): AnnouncementPriority;
}

export class DefaultAnnouncementPriorityStrategy
  implements AnnouncementPriorityStrategy
{
  priorityFor(item: BoardItem): AnnouncementPriority {
    if (item.status === "cancelled") return "critical";
    if (item.status === "delayed" || item.status === "disrupted") return "warning";
    return "info";
  }
}

const formatTime = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(date);
};

const statusText = (item: BoardItem): string => {
  if (item.status === "cancelled") return "supprime";
  if (item.status === "delayed" && item.expectedTime) {
    return `retarde, nouvel horaire ${formatTime(item.expectedTime)}`;
  }
  if (item.status === "disrupted") return "perturbe";
  if (item.status === "on_time") return "a l'heure";
  return "statut non confirme";
};

export class AnnouncementService {
  constructor(private readonly priorityStrategy: AnnouncementPriorityStrategy) {}

  fromBoard(items: BoardItem[], updatedAt = new Date().toISOString()): Announcement[] {
    return items
      .filter((item) => item.status !== "on_time" || item.platform || item.disruptions.length > 0)
      .map((item) => ({
        id: `announcement-${item.id}`,
        priority: this.priorityStrategy.priorityFor(item),
        text: this.buildText(item),
        relatedTrainId: item.id,
        updatedAt,
      }))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }

  private buildText(item: BoardItem): string {
    const train = item.trainNumber ? `Train ${item.trainNumber}` : "Train";
    const line = item.line ? `, ligne ${item.line}` : "";
    const platform = item.platform ? `, voie ${item.platform}` : ", voie non communiquee";
    const disruption = item.disruptions[0]?.title
      ? `. Information: ${item.disruptions[0].title}.`
      : ".";

    return `${train}${line} vers ${item.destination ?? "destination non communiquee"}, depart ${formatTime(
      item.time,
    )}${platform}, ${statusText(item)}${disruption}`;
  }
}

const priorityRank = (priority: AnnouncementPriority): number => {
  if (priority === "critical") return 0;
  if (priority === "warning") return 1;
  return 2;
};
