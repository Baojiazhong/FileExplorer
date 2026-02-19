import '@testing-library/jest-dom/vitest';

// React 18 warns if act() isn't enabled in the env.
// Vitest + RTL work fine without this, but setting it silences noisy stderr.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
