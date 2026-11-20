import { createClient } from "npm:@supabase/supabase-js@2";
import { getAddressByBarangayCode } from "npm:@aivangogh/ph-address@2026.2.4";
import { timingSafeEqual } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function invalidProbeParameters(temperature: number, oxygen: number, ph: number) {
  return [
    ...(!Number.isFinite(temperature) || temperature < -55 || temperature > 125 ? ["temperature"] : []),
    ...(!Number.isFinite(oxygen) || oxygen < 0 ? ["do"] : []),
    ...(!Number.isFinite(ph) || ph < 0 || ph > 14 ? ["ph"] : []),
  ];
}

function evaluateEventImpact(event: { type: string }) {
  switch (event.type) {
    case "Rainfall":
    case "Water change / exchange":
    case "Freshwater dosing (log only)":
      return {
        targetAdvisory: "salinity",
        riskAdjustment: "Watch",
        message: `Recent event (${event.type}) logged. Salinity check recommended.`,
      };

    case "Unusually hot weather":
    case "Feeding":
    case "Mortality observation":
    case "Power interruption":
      return {
        targetAdvisory: "ammonia",
        riskAdjustment: event.type === "Power interruption" ? "High" : "Watch",
        message: `Event (${event.type}) impacts organic load/temperature. Monitor TAN levels.`,
      };

    default:
      return null;
  }
}

class InvalidJsonError extends Error {}

async function readJson(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidJsonError();
    return body;
  } catch (error) {
    if (error instanceof InvalidJsonError ||
        (typeof error === "object" && error !== null && "name" in error && error.name === "SyntaxError")) {
      throw new InvalidJsonError();
    }
    throw error;
  }
}

function serverError(error: unknown) {
  console.error("API error:", error);
  return json({ error: "Internal server error." }, 500);
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

const isText = (value: unknown, max = 200) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const isOptionalText = (value: unknown, max = 500) =>
  value == null || (typeof value === "string" && value.length <= max);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isOptionalNumber = (value: unknown) => value == null || isNumber(value);
const isDate = (value: unknown) => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const siteAliases: Record<string, string[]> = {
  "camiguin-sagay": ["camiguin-sagay", "Camiguin, Sagay Multispecies Hatchery"],
  "camiguin-benoni": ["camiguin-benoni", "Camiguin, Benoni Experimental Station"],
};
function siteVariants(site: unknown): string[] {
  if (typeof site !== "string" || !site.trim()) return [];
  const trimmed = site.trim();
  return Object.values(siteAliases).find((aliases) => aliases.includes(trimmed)) ?? [trimmed];
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(request.url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let publicPath = url.pathname;
    publicPath = publicPath.replace(/^\/functions\/v1\/api/, "");
    publicPath = publicPath.replace(/^\/api/, "");
    const [action] = publicPath.split("?");

    if (action === "/v1/auth/signup" && request.method === "POST") {
      const body = await readJson(request);
      const required = ["firstName", "lastName", "employeeId", "phone", "email", "emergencyContactName", "emergencyContactPhone"];
      if (required.some((key) => typeof body[key] !== "string" || !body[key].trim()) ||
          typeof body.password !== "string" || body.password.length < 8 ||
          !["camiguin-sagay", "camiguin-benoni"].includes(body.hatcheryId) ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
          !/^[+()\d\s.-]{7,20}$/.test(body.phone.trim()) ||
          !/^[+()\d\s.-]{7,20}$/.test(body.emergencyContactPhone.trim())) {
        return json({ error: "Complete all required fields with valid contact details and a password of at least 8 characters." }, 400);
      }
      const address = body.address;
      if (!address || address.country !== "PH" || typeof address.street !== "string" || !address.street.trim() ||
          typeof address.barangay !== "string" || typeof address.city !== "string" || typeof address.province !== "string") {
        return json({ error: "A complete Philippine address is required." }, 400);
      }
      const location = getAddressByBarangayCode(address.barangay);
      if (!location || location.municipality.psgcCode !== address.city ||
          (location.province?.psgcCode ?? location.region.psgcCode) !== address.province) {
        return json({ error: "Select a valid province, city and barangay." }, 400);
      }
      const cityName = location.municipality.provinceCode === "1380600000"
        ? `Manila - ${location.municipality.name}` : location.municipality.name;
      const formattedAddress = [address.street.trim(), location.barangay.name, cityName,
        location.province?.name ?? location.region.name, "Philippines"].join(", ");
      const authClient = createClient(supabaseUrl, anonKey);
      const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
      const { error } = await authClient.auth.signUp({
        email: body.email.trim(),
        password: body.password,
        options: {
          emailRedirectTo: `${siteUrl}/signin?verified=1`,
          data: {
            firstName: body.firstName,
            lastName: body.lastName,
            employeeId: body.employeeId,
            phone: body.phone,
            address: formattedAddress,
            emergencyContactName: body.emergencyContactName,
            emergencyContactPhone: body.emergencyContactPhone,
            hatcheryId: body.hatcheryId,
          },
        },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ status: "verify-email", email: body.email.trim() }, 201);
    }

    if (action === "/v1/auth/signin" && request.method === "POST") {
      const body = await readJson(request);
      const authClient = createClient(supabaseUrl, anonKey);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
      if (error || !data.user || !data.session) return json({ error: "Invalid credentials." }, 401);
      const { data: profile, error: profileError } = await admin.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      if (profileError) return serverError(profileError);
      if (profile && profile.active !== true) return json({ error: "Account is inactive." }, 403);
      if (!profile || profile.status !== "approved") {
        return json({ status: profile?.status ?? "pending" }, profile?.status === "rejected" ? 403 : 200);
      }
      await admin.from("profiles").update({ last_active: new Date().toISOString() }).eq("id", data.user.id);
      return json({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
          role: profile.role,
          requestedRole: profile.requested_role,
          status: profile.status,
          position: profile.position,
        },
      });
    }

    if ((action === "/v1/ingest/readings" || action === "/v1/hardware/thresholds" || action === "/v1/hardware/sms/claim" ||
         action === "/v1/hardware/sms/complete") && request.method === "POST") {
      const hardwareKey = Deno.env.get("HARDWARE_INGEST_API_KEY");
      const suppliedKey = request.headers.get("x-hardware-api-key");
      if (!hardwareKey || !suppliedKey || !await secureEqual(suppliedKey, hardwareKey)) {
        return json({ error: "Invalid hardware API key." }, 401);
      }

      const reading = await readJson(request);
      const deviceId = String(reading.deviceId ?? "").trim();
      if (action !== "/v1/ingest/readings") {
        if (!deviceId) return json({ error: "deviceId is required." }, 400);
        const { data: tank, error: tankError } = await admin.from("tanks")
          .select("id").eq("device_id", deviceId).maybeSingle();
        if (tankError) return serverError(tankError);
        if (!tank) return json({ error: "Device is not linked to a tank." }, 404);
        if (action === "/v1/hardware/thresholds") {
          const { data, error } = await admin.from("thresholds").select("parameter,min_value,max_value");
          if (error) return serverError(error);
          return json({ thresholds: data });
        }
        if (action === "/v1/hardware/sms/claim") {
          const { data, error } = await admin.rpc("claim_alert_sms", { p_tank_id: tank.id });
          if (error) return serverError(error);
          const item = data?.[0];
          return json({ message: item ? { id: item.id, phone: item.phone, text: item.message } : null });
        }
        if (typeof reading.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reading.id) ||
            !["sent", "failed"].includes(reading.status)) {
          return json({ error: "A valid message id and status are required." }, 400);
        }
        const { data, error } = await admin.from("sms_alert_queue")
          .update({ status: reading.status, completed_at: new Date().toISOString() })
          .eq("id", reading.id).eq("tank_id", tank.id).eq("status", "claimed")
          .select("id").maybeSingle();
        if (error) return serverError(error);
        if (!data) return json({ error: "Claimed SMS not found for this device." }, 404);
        return json({ updated: true });
      }
      const numericValue = (value: unknown) =>
        typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
      const temperature = numericValue(reading.temperature);
      const doMgL = numericValue(reading.doMgL);
      const ph = numericValue(reading.ph);
      if (!deviceId || ![temperature, doMgL, ph].every(Number.isFinite)) {
        return json({ error: "deviceId, temperature, doMgL, and ph are required numeric values." }, 400);
      }

      const { data: tank, error: tankError } = await admin.from("tanks")
        .select("id").eq("device_id", deviceId).maybeSingle();
      if (tankError) return serverError(tankError);
      if (!tank) return json({ error: "Device is not linked to a tank." }, 404);

      const buffered = reading.sourceId !== undefined || reading.recordedAt !== undefined || reading.historical !== undefined;
      const sourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let recordedAt: string | undefined;
      let live = true;
      if (buffered) {
        if (typeof reading.sourceId !== "string" || !sourceIdPattern.test(reading.sourceId) ||
            typeof reading.recordedAt !== "string" || typeof reading.historical !== "boolean" ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(reading.recordedAt)) {
          return json({ error: "Buffered readings require a sourceId, UTC recordedAt and historical flag." }, 400);
        }
        const observed = Date.parse(reading.recordedAt);
        if (!Number.isFinite(observed) || new Date(observed).toISOString() !== reading.recordedAt.replace("Z", ".000Z") ||
            observed < Date.UTC(2023, 0, 1) || observed > Date.now() + 30000) {
          return json({ error: "Invalid reading timestamp." }, 400);
        }
        recordedAt = reading.recordedAt;
        live = !reading.historical && Date.now() - observed <= 90000;
      }

      const optionalNumber = (value: unknown) => {
        const number = numericValue(value);
        return Number.isFinite(number) ? number : null;
      };
      const row = {
        tank_id: tank.id,
        temperature,
        do_mg_l: doMgL,
        ph,
        ec_u_s_cm: optionalNumber(reading.ec),
        salinity_ppm: optionalNumber(reading.salinity),
        tds_ppm: optionalNumber(reading.tds),
        do_saturation_pct: optionalNumber(reading.doSaturation),
        do_probe_temperature: optionalNumber(reading.doProbeTemperature),
        ...(buffered ? { source_id: reading.sourceId, timestamp: recordedAt } : {}),
      };
      let { data, error } = await admin.from("readings").insert(row).select("id,timestamp").single();
      if (error && buffered && error.code === "23505") {
        const existing = await admin.from("readings").select("id,timestamp")
          .eq("tank_id", tank.id).eq("source_id", reading.sourceId).single();
        data = existing.data;
        error = existing.error;
      }
      if (error || !data) return json({ error: error?.message ?? "Reading not found after insert." }, 400);

      const { data: thresholds, error: thresholdsError } = live
        ? await admin.from("thresholds").select("*") : { data: [], error: null };
      if (thresholdsError) console.error("Could not load thresholds after storing reading:", thresholdsError);
      const checkAndCreateAlert = async (parameter: string, value: number, thresholdRow: { min_value?: number; max_value?: number } | undefined) => {
        if (!thresholdRow || value === null) return;
        const min = thresholdRow.min_value;
        const max = thresholdRow.max_value;
        const below = min != null && value < min;
        const above = max != null && value > max;
        if (!below && !above) return;

        const { data: recentAlert, error: recentAlertError } = await admin
          .from("alerts")
          .select("id")
          .eq("tank_id", tank.id)
          .eq("parameter", parameter)
          .in("status", ["open", "acknowledged"])
          .limit(1);
        if (recentAlertError) throw recentAlertError;
        if (recentAlert?.length) return;

        const thresholdStr = [
          min !== null && min !== undefined ? `>${min}` : null,
          max !== null && max !== undefined ? `<${max}` : null,
        ].filter(Boolean).join(" or ");

        const margins: Record<string, { below: number; above: number }> = {
          temperature: { below: 0, above: 2 },
          do: { below: 1, above: 1 },
          ph: { below: 0.5, above: 0.5 },
        };
        const excess = below ? min! - value : value - max!;
        const severity = excess >= (below ? margins[parameter].below : margins[parameter].above) ? "critical" : "warning";
        const { error: alertError } = await admin.from("alerts").insert({
          tank_id: tank.id,
          parameter,
          value,
          threshold: thresholdStr || "configured",
          severity,
          status: "open",
        });
        if (alertError && alertError.code !== "23505") throw alertError;
      };

      const invalidParameters = invalidProbeParameters(temperature, doMgL, ph);
      if (invalidParameters.length) console.warn(`Invalid sensor readings from ${deviceId}: ${invalidParameters.join(", ")}. Check probe.`);
      const temperatureThreshold = thresholds?.find((t) => t.parameter === "temperature");
      const doThreshold = thresholds?.find((t) => t.parameter === "do");
      const phThreshold = thresholds?.find((t) => t.parameter === "ph");

      const alertResults = await Promise.allSettled([
        ...(!invalidParameters.includes("temperature") ? [checkAndCreateAlert("temperature", temperature, temperatureThreshold)] : []),
        ...(!invalidParameters.includes("do") ? [checkAndCreateAlert("do", doMgL, doThreshold)] : []),
        ...(!invalidParameters.includes("ph") ? [checkAndCreateAlert("ph", ph, phThreshold)] : []),
      ]);
      for (const result of alertResults) {
        if (result.status === "rejected") console.error(`Alert write failed for reading ${data.id}:`, result.reason);
      }

      const wifiRssi = optionalNumber(reading.wifiRssi);
      const batteryPct = optionalNumber(reading.batteryPct);
      const { error: deviceError } = await admin.from("device_statuses").upsert({
        device_id: deviceId,
        online: true,
        last_seen: new Date().toISOString(),
        power_source: String(reading.powerSource ?? "grid"),
        wifi_rssi: wifiRssi ?? 0,
        pending_sync_count: optionalNumber(reading.pendingSyncCount) ?? 0,
        battery_pct: batteryPct ?? null,
      }, { onConflict: "device_id" });
      if (deviceError) {
        console.error(`Reading ${data.id} was stored, but device status could not be updated:`, deviceError);
        return json({ error: "Reading was stored, but device status could not be updated.", readingId: data.id }, 500);
      }

      return json({ accepted: true, readingId: data.id, timestamp: data.timestamp, invalidParameters }, 201);
    }

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required." }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid or expired session." }, 401);

    const { data: profile, error: profileError } = await admin.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();
    if (profileError) return serverError(profileError);
    if (!profile || profile.active !== true || profile.status !== "approved" || !["operator", "manager", "admin"].includes(profile.role)) {
      return json({ error: "An approved account is required." }, 403);
    }
    const actor = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email;

    if (action === "/v1/tanks" && request.method === "GET") {
      let query = admin.from("tanks").select("*").order("name");
      if (profile.role === "manager") {
        const sites = siteVariants(profile.site);
        if (!sites.length) return json([]);
        query = query.in("site", sites);
      }
      const { data, error } = await query;
      if (error) return serverError(error);
      return json(data?.map((tank) => ({
        id: tank.id,
        name: tank.name,
        site: tank.site,
        rearingStartDate: tank.rearing_start_date,
        deviceId: tank.device_id,
      })));
    }

    if (action === "/v1/tanks" && request.method === "POST") {
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      const tank = await readJson(request);
      if (!isText(tank.name, 100) || !isText(tank.site, 200) || !isText(tank.deviceId, 100) || !isDate(tank.rearingStartDate)) {
        return json({ error: "A valid tank name, site, device ID and rearing start date are required." }, 400);
      }
      if (profile.role === "manager" && !siteVariants(profile.site).includes(tank.site.trim())) return json({ error: "Forbidden." }, 403);
      const { data, error } = await admin.from("tanks").insert({
        name: tank.name.trim(),
        site: tank.site.trim(),
        rearing_start_date: tank.rearingStartDate,
        device_id: tank.deviceId.trim(),
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      const { error: auditError } = await admin.from("audit_logs").insert({ user_name: actor, action: "Tank registered", detail: `${data.name} · hardware ${data.device_id}` });
      if (auditError) console.error("Could not record tank registration audit:", auditError);
      return json({ id: data.id, name: data.name, site: data.site, rearingStartDate: data.rearing_start_date, deviceId: data.device_id }, 201);
    }

    if (action === "/v1/readings" && request.method === "GET") {
      const parameter = url.searchParams.get("parameter");
      const columns: Record<string, string> = { temperature: "temperature", do: "do_mg_l", ph: "ph" };
      if (parameter && parameter !== "all" && !Object.hasOwn(columns, parameter)) return json({ error: "Invalid parameter." }, 400);
      const requestedLimit = Number(url.searchParams.get("limit") ?? 500);
      const limit = Number.isFinite(requestedLimit) ? Math.min(2000, Math.max(1, Math.trunc(requestedLimit))) : 500;
      let query = admin.from("readings").select("*");
      if (url.searchParams.get("tankId")) query = query.eq("tank_id", url.searchParams.get("tankId"));
      if (url.searchParams.get("from")) query = query.gte("timestamp", url.searchParams.get("from"));
      if (url.searchParams.get("to")) query = query.lte("timestamp", url.searchParams.get("to"));
      if (parameter && parameter !== "all") query = query.not(columns[parameter], "is", null);
      query = query.order("timestamp", { ascending: false }).limit(limit);
      const { data, error } = await query;
      if (error) return serverError(error);
      return json((data ?? []).reverse().map((reading) => ({
        id: reading.id,
        tankId: reading.tank_id,
        timestamp: reading.timestamp,
        temperature: reading.temperature,
        doMgL: reading.do_mg_l,
        ph: reading.ph,
        ec: reading.ec_u_s_cm,
        salinity: reading.salinity_ppm,
        tds: reading.tds_ppm,
        doSaturation: reading.do_saturation_pct,
        doProbeTemperature: reading.do_probe_temperature,
      })));
    }

    if (action === "/v1/devices/status" && request.method === "GET") {
      const { data, error } = await admin.from("device_statuses").select("*");
      if (error) return serverError(error);
      const { data: tanks, error: tanksError } = await admin.from("tanks").select("id,device_id");
      if (tanksError) return serverError(tanksError);
      const { data: latestReadings, error: readingError } = await admin.rpc("latest_tank_readings");
      if (readingError) return serverError(readingError);
      const deviceByTank = new Map((tanks ?? []).map((tank) => [tank.id, tank.device_id]));
      const latestReadingByDevice = new Map((latestReadings ?? [])
        .filter((reading) => deviceByTank.has(reading.tank_id))
        .map((reading) => [deviceByTank.get(reading.tank_id), reading]));
      const statusesByDevice = new Map((data ?? []).map((status) => [status.device_id, status]));
      const deviceIds = new Set([
        ...(data ?? []).map((status) => status.device_id),
        ...latestReadingByDevice.keys(),
      ]);
      const now = Date.now();
      const onlineWindowMs = 15 * 60 * 1000;

      return json([...deviceIds].map((deviceId) => {
        const status = statusesByDevice.get(deviceId);
        const latestReading = latestReadingByDevice.get(deviceId);
        const readingTimestamp = latestReading?.timestamp as string | undefined;
        const statusTimestamp = status?.last_seen as string | undefined;
        const lastSeen = readingTimestamp && (!statusTimestamp || readingTimestamp > statusTimestamp)
          ? readingTimestamp
          : statusTimestamp ?? readingTimestamp ?? null;
        return {
          deviceId,
          online: Boolean(lastSeen && now - new Date(lastSeen).getTime() <= onlineWindowMs),
          lastSeen: lastSeen ?? new Date(0).toISOString(),
          batteryPct: status?.battery_pct ?? null,
          powerSource: status?.power_source ?? "grid",
          wifiRssi: status?.wifi_rssi ?? 0,
          pendingSyncCount: status?.pending_sync_count ?? 0,
          ...(latestReading ? {
            invalidParameters: invalidProbeParameters(latestReading.temperature, latestReading.do_mg_l, latestReading.ph),
            probeCheckedAt: latestReading.timestamp,
          } : {}),
        };
      }));
    }

    if (action.startsWith("/v1/tanks/") && action.endsWith("/readings/latest") && request.method === "GET") {
      const tankId = decodeURIComponent(action.split("/")[3]);
      const { data, error } = await admin.from("readings").select("*").eq("tank_id", tankId).order("timestamp", { ascending: false }).limit(1).maybeSingle();
      if (error) return serverError(error);
      return json(data ? {
        id: data.id,
        tankId: data.tank_id,
        timestamp: data.timestamp,
        temperature: data.temperature,
        doMgL: data.do_mg_l,
        ph: data.ph,
        ec: data.ec_u_s_cm,
        salinity: data.salinity_ppm,
        tds: data.tds_ppm,
        doSaturation: data.do_saturation_pct,
        doProbeTemperature: data.do_probe_temperature,
      } : null);
    }

    const advisoryMatch = action.match(/^\/v1\/tanks\/([^/]+)\/advisories$/);
    if (advisoryMatch && request.method === "GET") {
      const { data: settings, error: settingsError } = await admin.from("advisory_settings").select("*").eq("id", true).single();
      if (settingsError) return serverError(settingsError);
      const tankId = decodeURIComponent(advisoryMatch[1]);
      const { data: latest, error: readingError } = await admin.from("readings")
        .select("*")
        .eq("tank_id", tankId)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readingError) return serverError(readingError);
      if (!latest) return json([]);
      if (invalidProbeParameters(latest.temperature, 0, latest.ph).length) {
        return json({ error: "Advisories unavailable: invalid temperature or pH reading. Check probe." }, 422);
      }
      const now = new Date();
      const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const { data: entries, error: entriesError } = await admin.from("manual_entries").select("type").eq("tank_id", tankId)
        .gte("timestamp", since).lte("timestamp", now.toISOString());
      if (entriesError) return serverError(entriesError);
      const { data: events, error: eventsError } = await admin.from("api_activity_logs").select("kind,type,tank_id")
        .in("tank_id", [tankId, "hatchery"]).gte("occurred_at", since).lte("occurred_at", now.toISOString());
      if (eventsError) return serverError(eventsError);
      const rain = entries.some((entry) => entry.type === "rain_event") || events.some((event) => event.kind === "ENVIRONMENT" && event.type === "Rainfall");
      const dosing = entries.some((entry) => entry.type === "freshwater_dosing") || events.some((event) => event.kind === "OPERATION" && event.type === "Freshwater dosing (log only)");
      const impacts = events
        .map((event) => evaluateEventImpact({ type: event.type }))
        .filter((impact) => impact !== null);
      const salinityMessages = [...new Set(impacts.filter((impact) => impact.targetAdvisory === "salinity").map((impact) => impact.message))];
      const ammoniaImpacts = impacts.filter((impact) => impact.targetAdvisory === "ammonia");
      const ammoniaMessages = [...new Set(ammoniaImpacts.map((impact) => impact.message))];
      const temperature = latest.temperature;
      const ph = latest.ph;
      const salinityBaseLevel = temperature >= settings.salinity_high_temperature_c && !rain && !dosing ? "high" :
        temperature >= settings.salinity_watch_temperature_c || rain || dosing ? "watch" : "low";
      const salinityLevel = salinityBaseLevel === "high" ? "high" :
        salinityBaseLevel === "watch" || salinityMessages.length ? "watch" : "low";
      const ammoniaBaseLevel = temperature >= settings.ammonia_watch_temperature_c || ph >= settings.ammonia_high_ph ? "watch" : "low";
      const ammoniaEventLevel = ammoniaImpacts.some((impact) => impact.riskAdjustment === "High") ? "high" : ammoniaImpacts.length ? "watch" : "low";
      const ammoniaLevel = ammoniaEventLevel === "high" ? "high" :
        ammoniaBaseLevel === "watch" || ammoniaEventLevel === "watch" ? "watch" : "low";
      const salinityRule = salinityBaseLevel === "high" ? `Temperature at or above ${settings.salinity_high_temperature_c}°C without a recent dilution event` :
        salinityBaseLevel === "watch" ? `Temperature at or above ${settings.salinity_watch_temperature_c}°C or a recent water event was logged` :
        salinityMessages.length ? "" : `No salinity advisory rule fired (temperature below ${settings.salinity_watch_temperature_c}°C; no recent water event)`;
      const ammoniaRule = ammoniaBaseLevel === "watch"
        ? `Temperature at or above ${settings.ammonia_watch_temperature_c}°C or high pH`
        : ammoniaMessages.length ? "" : "No ammonia advisory rule fired (temperature and pH below configured rules; usual feeding load)";
      return json([
        {
          kind: "salinity",
          level: salinityLevel,
          inputs: { temperatureC: temperature, recentRainEvent: rain ? "yes" : "no", freshwaterDosingLogged: dosing ? "yes" : "no" },
          firedRule: [salinityRule, ...salinityMessages].filter(Boolean).join(". "),
          updatedAt: latest.timestamp,
        },
        {
          kind: "ammonia",
          level: ammoniaLevel,
          inputs: { temperatureC: temperature, ph, feedingLoad: "usual", ...(ammoniaMessages.length ? { eventImpacts: ammoniaMessages.join(" ") } : {}) },
          firedRule: [ammoniaRule, ...ammoniaMessages].filter(Boolean).join(". "),
          updatedAt: latest.timestamp,
        },
      ]);
    }

    const tankDelete = action.match(/^\/v1\/tanks\/([^/]+)$/);
    if (tankDelete && request.method === "DELETE") {
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      const tankId = decodeURIComponent(tankDelete[1]);
      let query = admin.from("tanks").delete().eq("id", tankId);
      if (profile.role === "manager") {
        const sites = siteVariants(profile.site);
        if (!sites.length) return json({ error: "Forbidden." }, 403);
        query = query.in("site", sites);
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ error: "Tank not found or forbidden." }, 404);
      const { error: auditError } = await admin.from("audit_logs").insert({ user_name: actor, action: "Tank deleted", detail: tankId });
      if (auditError) {
        console.error("Could not record tank deletion audit:", auditError);
        return json({ error: "Tank was deleted, but its audit record could not be saved." }, 500);
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (action === "/v1/alerts" && request.method === "GET") {
      let query = admin.from("alerts").select("*");
      if (url.searchParams.get("tank_id")) query = query.eq("tank_id", url.searchParams.get("tank_id"));
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) return serverError(error);
      return json(data?.map((alert) => ({
        id: alert.id, tankId: alert.tank_id, parameter: alert.parameter, value: alert.value,
        threshold: alert.threshold, severity: alert.severity, status: alert.status,
        createdAt: alert.created_at, acknowledgedBy: alert.acknowledged_by,
        acknowledgedAt: alert.acknowledged_at, note: alert.note,
      })));
    }

    const alertResponse = action.match(/^\/v1\/alerts\/([^/]+)\/responses$/);
    if (alertResponse && request.method === "GET") {
      const { data, error } = await admin.from("alert_responses").select("*").eq("alert_id", decodeURIComponent(alertResponse[1])).order("created_at");
      if (error) return serverError(error);
      return json(data?.map((response) => ({
        id: response.id, alertId: response.alert_id, status: response.status,
        note: response.note, createdAt: response.created_at, createdBy: response.created_by,
      })));
    }

    const alertAction = action.match(/^\/v1\/alerts\/([^/]+)\/(acknowledge|resolve)$/);
    if (alertAction && request.method === "POST") {
      if (alertAction[2] === "resolve" && !["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      const input = await readJson(request);
      const status = alertAction[2] === "resolve" ? "resolved" : "acknowledged";
      if (typeof input.note !== "string" || input.note.length > 500 ||
          (status === "resolved" && input.note.trim().length < 3) ||
          (status === "acknowledged" && input.note.trim().length > 0 && input.note.trim().length < 3)) {
        return json({ error: status === "resolved" ? "Resolution notes must be 3 to 500 characters." : "Acknowledgement notes must be empty or 3 to 500 characters." }, 400);
      }
      const alertId = decodeURIComponent(alertAction[1]);
      const updates: Record<string, unknown> = { status, note: input.note };
      if (status === "acknowledged") {
        updates.acknowledged_by = actor;
        updates.acknowledged_at = new Date().toISOString();
      }
      const allowed = status === "acknowledged" ? ["open"] : ["open", "acknowledged"];
      const { data, error } = await admin.from("alerts").update(updates).eq("id", alertId).in("status", allowed).select().maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data) {
        const { data: existing, error: lookupError } = await admin.from("alerts").select("id").eq("id", alertId).maybeSingle();
        if (lookupError) return serverError(lookupError);
        return existing ? json({ error: "Alert status does not allow this action." }, 409) : json({ error: "Alert not found." }, 404);
      }
      const { error: responseError } = await admin.from("alert_responses").insert({
        alert_id: alertId, status, note: input.note, created_by: actor,
      });
      if (responseError) {
        console.error(`Alert ${alertId} was ${status}, but its response history could not be saved:`, responseError);
        return json({ error: `Alert was ${status}, but its response history could not be saved.`, alertId }, 500);
      }
      return json({
        id: data.id, tankId: data.tank_id, parameter: data.parameter, value: data.value,
        threshold: data.threshold, severity: data.severity, status: data.status,
        createdAt: data.created_at, acknowledgedBy: data.acknowledged_by,
        acknowledgedAt: data.acknowledged_at, note: data.note,
      });
    }

    if (action === "/v1/settings/thresholds" && ["GET", "PUT"].includes(request.method)) {
      if (request.method === "GET") {
        const { data, error } = await admin.from("thresholds").select("*");
        if (error) return serverError(error);
        return json(data?.map((threshold) => ({
          parameter: threshold.parameter,
          ...(threshold.min_value !== null ? { min: threshold.min_value } : {}),
          ...(threshold.max_value !== null ? { max: threshold.max_value } : {}),
        })));
      }
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      const body = await readJson(request);
      if (!Array.isArray(body.thresholds) || body.thresholds.length === 0 || body.thresholds.length > 3 ||
          body.thresholds.some((threshold: { parameter?: unknown; min?: unknown; max?: unknown }) =>
            !threshold || typeof threshold.parameter !== "string" || !["temperature", "do", "ph"].includes(threshold.parameter) ||
            !isOptionalNumber(threshold.min) || !isOptionalNumber(threshold.max) ||
            (threshold.min == null && threshold.max == null) ||
            (isNumber(threshold.min) && isNumber(threshold.max) && threshold.min >= threshold.max)) ||
          new Set(body.thresholds.map((threshold: { parameter: string }) => threshold.parameter)).size !== body.thresholds.length) {
        return json({ error: "Provide valid, unique thresholds with min less than max." }, 400);
      }
      const { error } = await admin.from("thresholds").upsert(body.thresholds.map((threshold: { parameter: string; min?: number; max?: number }) => ({
          parameter: threshold.parameter, min_value: threshold.min ?? null, max_value: threshold.max ?? null,
          updated_at: new Date().toISOString(),
        })));
      if (error) return serverError(error);
      const { error: auditError } = await admin.from("audit_logs").insert({ user_name: actor, action: "Thresholds updated", detail: "Water-quality thresholds" });
      if (auditError) console.error("Could not record thresholds audit:", auditError);
      return json(body.thresholds);
    }

    if (action === "/v1/settings/advisory-rules" && ["GET", "PUT"].includes(request.method)) {
      if (request.method === "GET") {
        const { data, error } = await admin.from("advisory_settings").select("*").eq("id", true).single();
        if (error) return serverError(error);
        return json({
          salinityWatchTemperatureC: data.salinity_watch_temperature_c,
          salinityHighTemperatureC: data.salinity_high_temperature_c,
          ammoniaWatchTemperatureC: data.ammonia_watch_temperature_c,
          ammoniaHighPh: data.ammonia_high_ph,
        });
      }
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      const body = await readJson(request);
      if (!body.settings || typeof body.settings !== "object" ||
          !["salinityWatchTemperatureC", "salinityHighTemperatureC", "ammoniaWatchTemperatureC", "ammoniaHighPh"]
            .every((key) => isNumber(body.settings[key])) ||
          body.settings.salinityWatchTemperatureC >= body.settings.salinityHighTemperatureC) {
        return json({ error: "Provide valid advisory rules with watch temperature below high temperature." }, 400);
      }
      const { data: updated, error } = await admin.from("advisory_settings").update({
        salinity_watch_temperature_c: body.settings.salinityWatchTemperatureC,
        salinity_high_temperature_c: body.settings.salinityHighTemperatureC,
        ammonia_watch_temperature_c: body.settings.ammoniaWatchTemperatureC,
        ammonia_high_ph: body.settings.ammoniaHighPh,
      }).eq("id", true).select("id").maybeSingle();
      if (error) return serverError(error);
      if (!updated) return serverError(new Error("Advisory settings row is missing."));
      const { error: auditError } = await admin.from("audit_logs").insert({ user_name: actor, action: "Advisory rules updated", detail: "Salinity and ammonia rules" });
      if (auditError) console.error("Could not record advisory rules audit:", auditError);
      return json(body.settings);
    }

    if (action === "/v1/manual-entries" && ["GET", "POST"].includes(request.method)) {
      if (request.method === "GET") {
        let query = admin.from("manual_entries").select("*");
        if (url.searchParams.get("tank_id")) query = query.eq("tank_id", url.searchParams.get("tank_id"));
        const { data, error } = await query.order("timestamp", { ascending: false });
        if (error) return serverError(error);
        return json(data?.map((row) => ({
          id: row.id, tankId: row.tank_id, type: row.type, value: row.value,
          unit: row.unit, timestamp: row.timestamp, enteredBy: row.entered_by, note: row.note,
        })) ?? []);
      }

      const body = await readJson(request);
      if (!isText(body.tankId, 200) || !isText(body.type, 100) || !isOptionalNumber(body.value) ||
          !isOptionalText(body.unit, 50) || !isOptionalText(body.note, 500)) {
        return json({ error: "Provide a valid tank, entry type, value, unit and note." }, 400);
      }
      const { data, error } = await admin.from("manual_entries").insert({
        tank_id: body.tankId, type: body.type, value: body.value ?? null,
        unit: body.unit ?? null, entered_by: actor, note: body.note ?? null,
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({
        id: data.id, tankId: data.tank_id, type: data.type, value: data.value,
        unit: data.unit, timestamp: data.timestamp, enteredBy: data.entered_by, note: data.note,
      }, 201);
    }

    if (action === "/v1/activity-logs" && ["GET", "POST"].includes(request.method)) {
      if (request.method === "GET") {
        let query = admin.from("api_activity_logs").select("*");
        if (url.searchParams.get("tank_id")) query = query.in("tank_id", [url.searchParams.get("tank_id"), "hatchery"]);
        const { data, error } = await query.order("occurred_at", { ascending: false });
        if (error) return serverError(error);
        return json(data?.map((row) => ({
          id: row.id, tankId: row.tank_id, kind: row.kind, type: row.type,
          occurredAt: row.occurred_at, operator: row.operator, notes: row.notes,
          waterChangePercent: row.water_change_percent, waterSource: row.water_source,
          impact: row.impact, manualReadings: row.manual_readings,
        })) ?? []);
      }

      const body = await readJson(request);
      const manualReadings = body.manualReadings;
      if (!isText(body.tankId, 200) || !isText(body.kind, 100) || !isText(body.type, 100) ||
          !isOptionalText(body.notes, 500) || !isOptionalText(body.waterSource, 200) || !isOptionalText(body.impact, 500) ||
          !isOptionalNumber(body.waterChangePercent) ||
          (body.waterChangePercent != null && (body.waterChangePercent < 0 || body.waterChangePercent > 100)) ||
          (manualReadings != null && (typeof manualReadings !== "object" || Array.isArray(manualReadings) ||
            Object.entries(manualReadings).some(([key, value]) => key === "method" ? !isOptionalText(value, 200) : !isOptionalNumber(value))))) {
        return json({ error: "Provide valid activity details." }, 400);
      }
      const { data, error } = await admin.from("activity_logs").insert({
        tank_id: body.tankId, kind: body.kind, type: body.type,
        operator: actor, notes: body.notes ?? "", water_change_percent: body.waterChangePercent ?? null,
        water_source: body.waterSource ?? null, impact: body.impact ?? null,
        manual_readings: body.manualReadings ?? null,
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({
        id: data.id, tankId: data.tank_id, kind: data.kind, type: data.type,
        occurredAt: data.occurred_at, operator: data.operator, notes: data.notes,
        waterChangePercent: data.water_change_percent, waterSource: data.water_source,
        impact: data.impact, manualReadings: data.manual_readings,
      }, 201);
    }

    if (action === "/v1/calibrations" && ["GET", "POST"].includes(request.method)) {
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      if (request.method === "GET") {
        let query = admin.from("calibration_logs").select("*");
        if (url.searchParams.get("tank_id")) query = query.eq("tank_id", url.searchParams.get("tank_id"));
        const { data, error } = await query.order("date", { ascending: false });
        if (error) return serverError(error);
        return json(data?.map((row) => ({
          id: row.id, tankId: row.tank_id, parameter: row.parameter, standard: row.standard,
          before: row.before_value, after: row.after_value, date: row.date,
          user: row.user_name, nextDue: row.next_due,
        })));
      }
      const body = await readJson(request);
      if (!isText(body.tankId, 200) || !["ph", "do"].includes(body.parameter) || !isText(body.standard, 200) ||
          !isNumber(body.before) || !isNumber(body.after) || !isDate(body.date) || !isDate(body.nextDue)) {
        return json({ error: "Provide valid calibration details." }, 400);
      }
      const { data, error } = await admin.from("calibration_logs").insert({
        tank_id: body.tankId, parameter: body.parameter, standard: body.standard,
        before_value: body.before, after_value: body.after, date: body.date,
        user_name: actor, next_due: body.nextDue,
      }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ id: data.id, tankId: data.tank_id, parameter: data.parameter, standard: data.standard, before: data.before_value, after: data.after_value, date: data.date, user: data.user_name, nextDue: data.next_due }, 201);
    }

    if (action === "/v1/validation" && request.method === "GET") {
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      let query = admin.from("validation_rows").select("*");
      if (url.searchParams.get("tank_id")) query = query.eq("tank_id", url.searchParams.get("tank_id"));
      const { data, error } = await query;
      if (error) return serverError(error);
      return json(data?.map((row) => ({
        id: row.id,
        tankId: row.tank_id,
        parameter: row.parameter,
        hydrosenseMean: row.hydrosense_mean,
        reference: row.reference,
        error: row.error,
        pctError: row.pct_error,
        tolerance: row.tolerance,
        pass: row.pass,
      })) ?? []);
    }

    if (action === "/v1/validation/tolerances" && ["GET", "PUT"].includes(request.method)) {
      if (!["manager", "admin"].includes(profile.role)) return json({ error: "Forbidden." }, 403);
      if (request.method === "GET") {
        const { data, error } = await admin.from("validation_tolerances").select("*").eq("id", true).single();
        if (error) return serverError(error);
        return json({ temperature: data.temperature, ph: data.ph, do: data.dissolved_oxygen });
      }
      const body = await readJson(request);
      if (!body.tolerances || typeof body.tolerances !== "object" ||
          !["temperature", "ph", "do"].every((key) => isNumber(body.tolerances[key]) && body.tolerances[key] >= 0)) {
        return json({ error: "Provide valid non-negative tolerances." }, 400);
      }
      const { data: updated, error } = await admin.from("validation_tolerances").update({
        temperature: body.tolerances.temperature,
        ph: body.tolerances.ph,
        dissolved_oxygen: body.tolerances.do,
      }).eq("id", true).select("id").maybeSingle();
      if (error) return serverError(error);
      if (!updated) return serverError(new Error("Validation tolerances row is missing."));
      return json(body.tolerances);
    }

    if (action === "/v1/profile" && request.method === "GET") {
      return json({
        id: profile.id, name: `${profile.first_name} ${profile.last_name}`.trim(), email: profile.email,
        role: profile.role, status: profile.status, site: profile.site, createdAt: profile.created_at,
        employeeId: profile.employee_id, phone: profile.phone, position: profile.position, address: profile.address,
        emergencyContactName: profile.emergency_contact_name, emergencyContactPhone: profile.emergency_contact_phone,
      });
    }

    if ((action === "/v1/admin/users" || action === "/v1/admin/pending-requests") && request.method === "GET") {
      if (profile.role !== "admin" && (profile.role !== "manager" || action === "/v1/admin/pending-requests")) {
        return json({ error: "Forbidden." }, 403);
      }
      const status = action === "/v1/admin/pending-requests" ? "pending" : url.searchParams.get("status");
      if (status && !["pending", "approved", "rejected"].includes(status)) return json({ error: "Invalid account status." }, 400);
      if (profile.role !== "admin" && status && status !== "approved") return json({ error: "Forbidden." }, 403);
      const query = admin.from("profiles").select("*").order("created_at", { ascending: false }).eq("status", status ?? "approved");
      if (profile.role === "manager") {
        if (!profile.site?.trim()) return json([]);
        query.eq("site", profile.site).in("role", ["operator", "manager"]);
      }
      const { data, error } = await query;
      if (error) return serverError(error);
      return json(data?.map((user) => ({
        id: user.id, firstName: user.first_name, lastName: user.last_name, name: `${user.first_name} ${user.last_name}`.trim(), email: user.email,
        role: user.role, requestedRole: user.requested_role, status: user.status, createdAt: user.created_at,
        site: user.site, active: user.active, lastActive: user.last_active,
        employeeId: user.employee_id, phone: user.phone, position: user.position, address: user.address,
        emergencyContactName: user.emergency_contact_name, emergencyContactPhone: user.emergency_contact_phone,
      })));
    }

    const adminRoleUpdate = action.match(/^\/v1\/admin\/users\/([^/]+)\/role$/);
    if (adminRoleUpdate && request.method === "PUT") {
      if (profile.role !== "admin") return json({ error: "Forbidden." }, 403);
      const body = await readJson(request);
      if (body.role !== "operator" && body.role !== "manager") return json({ error: "Users may only be assigned the Operator or Manager role." }, 400);
      const userId = decodeURIComponent(adminRoleUpdate[1]);
      const { data, error } = await admin.from("profiles").update({ role: body.role }).eq("id", userId)
        .eq("status", "approved").in("role", ["operator", "manager"]).select().maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ error: "Approved non-admin account was not found." }, 404);
      const { error: auditError } = await admin.from("audit_logs").insert({
        user_name: actor, action: "User role updated", detail: `${userId} role set to ${body.role}`,
      });
      if (auditError) console.error("Could not record user role change audit:", auditError.message);
      return json({
        id: data.id, name: `${data.first_name} ${data.last_name}`.trim(), email: data.email,
        role: data.role, site: data.site, active: data.active, lastActive: data.last_active,
        employeeId: data.employee_id, phone: data.phone, position: data.position, address: data.address,
        emergencyContactName: data.emergency_contact_name, emergencyContactPhone: data.emergency_contact_phone,
      });
    }

    const adminUserUpdate = action.match(/^\/v1\/admin\/users\/([^/]+)$/);
    const pendingReview = action.match(/^\/v1\/admin\/pending-requests\/([^/]+)\/(approve|reject)$/);
    if ((adminUserUpdate && request.method === "PATCH") || (pendingReview && request.method === "PUT")) {
      if (profile?.role !== "admin" || profile.status !== "approved") return json({ error: "Forbidden." }, 403);
      const body = pendingReview?.[2] === "reject" ? { status: "rejected" } :
        pendingReview?.[2] === "approve" ? { ...(await readJson(request)), status: "approved" } : await readJson(request);
      if (!((body.status === "approved" && ["operator", "manager"].includes(body.role)) ||
        body.status === "rejected")) {
        return json({ error: "Select a valid approval role or reject the request." }, 400);
      }
      const updates = {
        status: body.status,
        ...(body.status === "approved" ? { role: body.role } : {}),
      };
      const userId = decodeURIComponent(pendingReview ? pendingReview[1] : adminUserUpdate![1]);
      const { data, error } = await admin.from("profiles").update(updates).eq("id", userId).eq("status", "pending").select().maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ error: "Pending account request was not found." }, 404);
      const { error: auditError } = await admin.from("audit_logs").insert({
        user_name: actor, action: body.status === "approved" ? "Request approved" : "Request rejected",
        detail: body.status === "approved" ? `${userId} role set to ${body.role}` : userId,
      });
      if (auditError) {
        console.error("Could not record account review audit:", auditError);
        return json({ error: "Request was reviewed, but its audit record could not be saved." }, 500);
      }
      return json({
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        requested_role: data.requested_role,
        status: data.status,
        role: data.role,
        position: data.position,
        created_at: data.created_at,
        employee_id: data.employee_id,
        phone: data.phone,
        address: data.address,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
      });
    }
    if (adminUserUpdate && request.method === "DELETE") {
      if (profile.role !== "admin") return json({ error: "Forbidden." }, 403);
      const userId = decodeURIComponent(adminUserUpdate[1]);
      if (userId === profile.id) return json({ error: "The administrator account cannot be removed." }, 400);
      const { data: target, error: targetError } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (targetError) return serverError(targetError);
      if (!target) return json({ error: "Account was not found." }, 404);
      if (target.role === "admin") return json({ error: "Administrator accounts cannot be removed." }, 400);
      const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", userId);
      if (deleteProfileError) return serverError(deleteProfileError);
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
      const { error: auditError } = await admin.from("audit_logs").insert({
        user_name: actor, action: "User deleted",
        detail: deleteAuthError ? `${userId}: profile deleted; auth deletion failed` : userId,
      });
      if (deleteAuthError) {
        console.error(`Profile ${userId} deleted, but auth deletion failed:`, deleteAuthError);
        if (auditError) console.error("Could not record partial deletion audit:", auditError);
        return json({ error: "Profile was removed, but the authentication account could not be removed." }, 500);
      }
      if (auditError) {
        console.error("Could not record user deletion audit:", auditError);
        return json({ error: "Account was removed, but its audit record could not be saved." }, 500);
      }
      return json({ id: userId, removed: true });
    }

    if (action === "/v1/admin/logs" && request.method === "GET") {
      if (profile.role !== "admin") return json({ error: "Forbidden." }, 403);
      const { data, error } = await admin.from("audit_logs").select("*").order("timestamp", { ascending: false });
      if (error) return serverError(error);
      return json(data?.map((log) => ({ id: log.id, timestamp: log.timestamp, user: log.user_name, action: log.action, detail: log.detail })));
    }

    return json({ error: `No API route for ${request.method} ${action}.` }, 404);
  } catch (error) {
    if (error instanceof InvalidJsonError) return json({ error: "Invalid JSON body." }, 400);
    return serverError(error);
  }
});
