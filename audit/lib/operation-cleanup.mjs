export async function runWithCleanup(operation, cleanup) {
  let result;
  let failure;
  try {
    result = await operation();
  } catch (error) {
    failure = { error };
  }
  try {
    await cleanup(result);
  } catch (error) {
    if (failure) throw new AggregateError([failure.error, error], "The operation and its cleanup both failed.");
    throw error;
  }
  if (failure) throw failure.error;
  return result;
}
