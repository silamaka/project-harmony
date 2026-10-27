import { QueryClient } from "@tanstack/react-query";
import { createRouter, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Données réutilisées 30 s sans être retéléchargées : sans ça, chaque
  // changement de page relançait toutes les listes (utilisateurs, missions,
  // livrables...). Les modifications faites dans l'app invalident déjà leurs
  // listes et restent donc immédiates ; celles des autres arrivent au plus
  // tard 30 s après, ou au retour sur l'onglet.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Paramètres écrits tels quels (?client=7 et non ?client=%227%22). À la
    // lecture, "7" redevient le nombre 7 : chaque route le reconvertit en
    // texte (voir searchText).
    stringifySearch: stringifySearchWith((value) =>
      typeof value === "string" ? value : JSON.stringify(value),
    ),
  });

  return router;
};
