import { QueryClient } from "@tanstack/react-query";
import { createRouter, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

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
