// Importing a font file yields its hashed build URL (the same asset the
// @fontsource CSS references), so it can be preloaded from the layout.
declare module "*.woff2" {
  const src: string;
  export default src;
}
