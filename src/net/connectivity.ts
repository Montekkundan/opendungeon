export type InternetReachability = "online" | "offline"
type FetchProbe = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export async function checkInternetConnectivity(timeoutMs = 1800, fetchImpl: FetchProbe = fetch): Promise<InternetReachability> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl("https://www.gstatic.com/generate_204", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
    return response.ok || response.status === 204 ? "online" : "offline"
  } catch {
    return "offline"
  } finally {
    clearTimeout(timer)
  }
}
