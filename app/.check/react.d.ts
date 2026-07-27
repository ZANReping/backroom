// 校验用 React 类型桩（未安装 @types/react 时使用；仅供本地类型校验）
declare module 'react' {
  export type ReactNode = unknown
  export type Key = string | number
  export type CSSProperties = Record<string, string | number | undefined>
  export type Ref<T> = { current: T | null } | ((v: T | null) => void) | null
  export namespace JSX { type Element = unknown }
  export function useState<S>(initial: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void]
  export function useRef<T>(initial: T): { current: T }
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useCallback<T extends (...a: never[]) => unknown>(fn: T, deps?: readonly unknown[]): T
  export function useMemo<T>(fn: () => T, deps?: readonly unknown[]): T
  export function useContext<T>(c: unknown): T
  export function useId(): string
  export function forwardRef<T, P>(r: (p: P, ref: Ref<T>) => unknown): (p: P) => unknown
  export function createContext<T>(d: T): unknown
  export function memo<T>(c: T): T
  const React: Record<string, unknown>
  export default React
}
declare global {
  namespace React {
    type ReactNode = unknown
    type CSSProperties = Record<string, string | number | undefined>
    type FC<P = Record<string, unknown>> = (p: P) => unknown
    type ComponentProps<T> = Record<string, unknown> & { __t?: T }
    type KeyboardEvent = { code: string; key: string; preventDefault(): void }
    type MouseEvent<T = unknown> = { button: number; clientX: number; clientY: number; preventDefault(): void; __t?: T }
    type PointerEvent<T = unknown> = { clientX: number; clientY: number; pointerId: number; preventDefault(): void; __t?: T }
    type TouchEvent<T = unknown> = { touches: unknown; preventDefault(): void; __t?: T }
    type ChangeEvent<T = unknown> = { target: { value: string } & Record<string, unknown>; __t?: T }
    type Dispatch<A> = (a: A) => void
    type SetStateAction<S> = S | ((p: S) => S)
    type RefObject<T> = { current: T | null }
    type ElementRef<T> = unknown & { __t?: T }
    type ReactElement = unknown
  }
  interface ImportMeta { env: Record<string, string | boolean | undefined> }
}
export {}
