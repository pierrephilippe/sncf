import { describe, expect, it } from "vitest";
import {
  AnnouncementService,
  DefaultAnnouncementPriorityStrategy,
} from "@/domain/announcements";
import type { BoardItem } from "@/domain/types";

describe("AnnouncementService", () => {
  it("priorise les suppressions avant les retards", () => {
    const service = new AnnouncementService(new DefaultAnnouncementPriorityStrategy());
    const items: BoardItem[] = [
      {
        id: "delayed",
        time: "2026-06-20T12:00:00+01:00",
        expectedTime: "2026-06-20T12:10:00+01:00",
        destination: "Dijon",
        status: "delayed",
        disruptions: [],
      },
      {
        id: "cancelled",
        time: "2026-06-20T12:05:00+01:00",
        destination: "Paris Gare de Lyon",
        status: "cancelled",
        disruptions: [],
      },
    ];

    const announcements = service.fromBoard(items, "2026-06-20T10:00:00Z");

    expect(announcements[0].priority).toBe("critical");
    expect(announcements[0].text).toContain("supprimé");
    expect(announcements[1].priority).toBe("warning");
  });
});
