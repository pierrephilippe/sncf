"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { Station } from "@/domain/types";

const STORAGE_KEY = "sncf-accessibilite:favorites";
const MAX_FAVORITES = 8;

const favoriteStationSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(120).optional(),
  coordinates: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }).optional(),
  source: z.literal("sncf"),
  distanceMeters: z.number().finite().nonnegative().optional(),
}).strip();

const favoriteStationsSchema = z.array(favoriteStationSchema).max(MAX_FAVORITES);

const readFavorites = (): Station[] => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = favoriteStationsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid JSON is handled by clearing the corrupted local value below.
  }

  window.localStorage.removeItem(STORAGE_KEY);
  return [];
};

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Station[]>([]);

  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  const save = (next: Station[]) => {
    const parsed = favoriteStationsSchema.safeParse(next.slice(0, MAX_FAVORITES));
    const sanitizedFavorites = parsed.success ? parsed.data : [];
    setFavorites(sanitizedFavorites);

    if (sanitizedFavorites.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedFavorites));
  };

  const addFavorite = (station: Station) => {
    save([station, ...favorites.filter((item) => item.id !== station.id)]);
  };

  const removeFavorite = (stationId: string) => {
    save(favorites.filter((item) => item.id !== stationId));
  };

  const isFavorite = (stationId: string) => favorites.some((item) => item.id === stationId);

  return { favorites, addFavorite, removeFavorite, isFavorite };
};
