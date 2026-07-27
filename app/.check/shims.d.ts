// 校验用外部模块桩：让未安装的三方模块解析为 any，从而只暴露「项目自身类型」的错误
declare module '*'
declare namespace JSX {
  interface Element { [k: string]: unknown }
  interface IntrinsicElements { [k: string]: Record<string, unknown> }
  interface ElementAttributesProperty { props: unknown }
  interface ElementChildrenAttribute { children: unknown }
}
