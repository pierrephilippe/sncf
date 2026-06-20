import type { BoardResponse } from "@/infrastructure/sncfSchemas";

export const delayedDepartureFixture: BoardResponse = {
  departures: [
    {
      display_informations: {
        code: "876543",
        direction: "Lyon Part Dieu",
        label: "TER",
      },
      stop_date_time: {
        base_departure_date_time: "20260620T140800",
        departure_date_time: "20260620T141800",
        links: [{ id: "delay-1", type: "disruption" }],
      },
    },
  ],
  disruptions: [
    {
      id: "delay-1",
      severity: { name: "Retard", effect: "SIGNIFICANT_DELAYS" },
      messages: [{ text: "Retard estime a 10 minutes." }],
    },
  ],
};
