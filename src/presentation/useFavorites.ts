"use client";

import { useEffect, useState } from "react";
import type { Station } from "@/domain/types";

const STORAGE_KEY = "sncf-accessibilite:favorites";

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Station[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      setFavorites(JSON.parse(raw) as Station[]);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const save = (next: Station[]) => {
    setFavorites(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const addFavorite = (station: Station) => {
    save([station, ...favorites.filter((item) => item.id !== station.id)].slice(0, 8));
  };

  const removeFavorite = (stationId: string) => {
    save(favorites.filter((item) => item.id !== stationId));
  };

  const isFavorite = (stationId: string) => favorites.some((item) => item.id === stationId);

  return { favorites, addFavorite, removeFavorite, isFavorite };
};
