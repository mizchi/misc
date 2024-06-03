// Get the current weather in a given location
export async function get_degree(input: {
  // The city and state, e.g. San Francisco, CA
  location: string
}) {
  return `The degree is 15 at ${input.location}.`;
}