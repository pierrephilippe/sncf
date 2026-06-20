import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useFavorites } from "@/presentation/useFavorites";

const STORAGE_KEY = "sncf-accessibilite:favorites";

describe("useFavorites", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("supprime les favoris stockes si leur structure est invalide", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "", name: "Paris", source: "sncf" }]));

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(result.current.favorites).toEqual([]);
  });

  it("limite et nettoie les favoris sauvegardes", async () => {
    const { result } = renderHook(() => useFavorites());

    await waitFor(() => expect(result.current.favorites).toEqual([]));

    for (let index = 0; index < 10; index += 1) {
      act(() => {
        result.current.addFavorite({
          id: `stop_area:SNCF:${index}`,
          name: `Gare ${index}`,
          source: "sncf",
        });
      });
    }

    expect(result.current.favorites).toHaveLength(8);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(8);
  });
});
