export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    }
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
