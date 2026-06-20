import {
  DefaultAnnouncementPriorityStrategy,
  AnnouncementService,
} from "@/domain/announcements";
import {
  FindNearbyStationsUseCase,
  GetStationAnnouncementsUseCase,
  GetStationBoardUseCase,
  SearchStationsUseCase,
} from "@/application/useCases";
import { getServerConfig } from "./config";
import { FetchSncfHttpClient } from "./sncfClient";
import { SncfBoardAdapter, SncfStationAdapter } from "./sncfAdapters";
import { SncfBoardRepository, SncfStationRepository } from "./repositories";

export const createApplication = () => {
  const config = getServerConfig();
  const client = new FetchSncfHttpClient(config.SNCF_API_BASE_URL, config.SNCF_API_TOKEN);
  const stations = new SncfStationRepository(client, new SncfStationAdapter());
  const boards = new SncfBoardRepository(client, new SncfBoardAdapter());
  const announcements = new AnnouncementService(new DefaultAnnouncementPriorityStrategy());

  return {
    searchStations: new SearchStationsUseCase(stations),
    findNearbyStations: new FindNearbyStationsUseCase(stations),
    getStationBoard: new GetStationBoardUseCase(boards),
    getStationAnnouncements: new GetStationAnnouncementsUseCase(boards, announcements),
  };
};
