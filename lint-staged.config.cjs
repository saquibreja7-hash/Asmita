// ESLint's flat config lives in asmita/, so a helper runs it from there.
module.exports = {
  "asmita/**/*.{ts,tsx,js,jsx}": "node scripts/lint-staged-eslint.cjs",
};
