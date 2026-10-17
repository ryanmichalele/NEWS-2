import { createContext, useContext, useMemo } from "react";
import { resolveEntities, type EntityMap } from "./resolveEntities";

export const EntityContext = createContext<EntityMap>({});

export function useEntityMap(): EntityMap {
  return useContext(EntityContext);
}

/** Wraps a value in the entity context so nested EntityText picks it up. */
export function EntityProvider({
  entities,
  children,
}: {
  entities: EntityMap;
  children: React.ReactNode;
}) {
  const value = useMemo(() => entities, [entities]);
  return (
    <EntityContext.Provider value={value}>{children}</EntityContext.Provider>
  );
}

type EntityTextProps = {
  children?: string | null;
  className?: string;
  as?: "span" | "p" | "div" | "h1" | "h2" | "h3" | "li" | "strong" | "a";
};

/**
 * Renders text with all configured entity references substituted.
 * Use this anywhere CMS or static copy contains a bank/location/advisor name.
 */
export function EntityText({
  children,
  className,
  as: Tag = "span",
}: EntityTextProps) {
  const entities = useEntityMap();
  const resolved = useMemo(
    () => resolveEntities(children ?? "", entities),
    [children, entities],
  );
  return <Tag className={className}>{resolved}</Tag>;
}

/** Resolves a string without rendering, for cases where a raw value is needed. */
export function useResolved(text: string): string {
  const entities = useEntityMap();
  return useMemo(() => resolveEntities(text, entities), [text, entities]);
}