import type { BoardResponse } from "@/infrastructure/sncfSchemas";

export const delayedDepartureFixture: BoardResponse = {
  departures: [
    {
      display_informations: {
        code: "876543",
        commercial_mode: "TER",
        direction: "Lyon Part Dieu",
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

export const arrivalFixture: BoardResponse = {
  arrivals: [
    {
      display_informations: {
        code: "123456",
        commercial_mode: "TGV INOUI",
        direction: "Marseille Saint-Charles",
      },
      stop_date_time: {
        base_arrival_date_time: "20260620T160500",
        arrival_date_time: "20260620T160500",
      },
    },
  ],
};
