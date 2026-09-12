// @stackfit/data: reads and Zod-validates the committed data/ tree.
//
// This is the boundary the engine deliberately does not cross. The engine takes
// its assumptions as arguments and never touches the filesystem; something
// outside it has to do the reading, and this is that something.
//
// It lives in a package rather than in scripts/ because three different callers
// need it (the CLI tools, the repo-root tests, and the web app's server
// components) and a second copy is how two loaders start disagreeing about
// which files exist.
export * from './load-config';
