declare module '@turbowarp/unpackager' {
  function unpackage(data: Uint8Array): Promise<{ data: Uint8Array }>;

  export default unpackage;
}