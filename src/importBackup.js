// Keep large exports restorable through the API's 20 MB request limit.
export async function importNoteBatches(notes, send, maxBytes = 10 * 1024 * 1024) {
  let batch = [], bytes = 12, imported = 0;
  const flush = async () => {
    if (!batch.length) return;
    await send({ notes: batch });
    imported += batch.length;
    batch = []; bytes = 12;
  };
  try {
    for await (const note of notes) {
      const size = new TextEncoder().encode(JSON.stringify(note)).byteLength + 1;
      if (size + 12 > 19 * 1024 * 1024) throw new Error('One note exceeds the API upload limit.');
      if (batch.length && bytes + size > maxBytes) await flush();
      batch.push(note); bytes += size;
    }
    await flush();
    return imported;
  } catch (error) {
    throw Object.assign(new Error(`Import stopped after ${imported} notes. ${error.message}`),{imported,cause:error});
  }
}
