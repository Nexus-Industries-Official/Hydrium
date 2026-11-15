const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const activeRoomByLoginLock = new Map();

// =========================================================
// "has this account already been through Orientation" (the Coach's room)
// =========================================================
// /matchmake/none used to send EVERY call here, new account or not, so every
// player kept landing back in Orientation (and seeing the Coach) instead of
// just the first time. data/oriented-accounts.json remembers who's been sent
// there already; re-read when it changes (no restart needed), same pattern as
// password-fix.js's password-set.json.

const ORIENTED_FILE = path.join(__dirname, "data", "oriented-accounts.json");

function readOriented() {
    try {
        return JSON.parse(fs.readFileSync(ORIENTED_FILE, "utf8"));
    } catch (_) {
        return {};
    }
}

function hasOriented(accountId) {
    if (accountId === null || accountId === undefined) return false;
    return Boolean(readOriented()[String(accountId)]);
}

function markOriented(accountId) {
    if (accountId === null || accountId === undefined) return;
    try {
        const m = readOriented();
        m[String(accountId)] = new Date().toISOString();
        fs.mkdirSync(path.dirname(ORIENTED_FILE), { recursive: true });
        fs.writeFileSync(ORIENTED_FILE, JSON.stringify(m, null, 2));
    } catch (err) {
        console.log("[MATCH] could not write", ORIENTED_FILE, err.message);
    }
}

// =========================================================
// JWT CONFIGURATION
// =========================================================

const JWT_SECRET =
    process.env.HYDRIUM_JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "HYDRIUM_JWT_SECRET is not configured"
    );
}


// =========================================================
// GAME CONFIGURATION
// =========================================================

const GAME_VERSION =
    process.env.GAME_VERSION ||
    "20231207";


// =========================================================
// PHOTON CONFIGURATION
// =========================================================

const PHOTON_REALTIME_APP_ID =
    process.env.PHOTON_REALTIME_APP_ID;

const PHOTON_VOICE_APP_ID =
    process.env.PHOTON_VOICE_APP_ID;

const PHOTON_CHAT_APP_ID =
    process.env.PHOTON_CHAT_APP_ID;

const PHOTON_REGION =
    process.env.PHOTON_REGION || "eu";

const PHOTON_AUTH_TOKEN =
    process.env.PHOTON_AUTH_TOKEN || "HYDRIUM_TEST_TOKEN_001";

for (const [k, v] of Object.entries({ PHOTON_REALTIME_APP_ID, PHOTON_VOICE_APP_ID, PHOTON_CHAT_APP_ID })) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""))) {
        throw new Error(`[MATCH] ${k} mancante o non valido nel file .env`);
    }
}


// =========================================================
// AUTHENTICATION HELPERS
// =========================================================

function getDecodedToken(req) {

    const auth =
        req.headers.authorization;

    if (
        !auth ||
        !auth.startsWith("Bearer ")
    ) {
        return null;
    }

    try {

        return jwt.verify(
            auth.substring(7),
            JWT_SECRET
        );

    } catch (err) {

        console.log(
            "[MATCH] Invalid bearer token:",
            err.message
        );

        return null;
    }
}


function getAccountId(req) {

    const decoded =
        getDecodedToken(req);

    if (
        !decoded ||
        decoded.sub === undefined ||
        decoded.sub === null
    ) {
        return null;
    }

    const accountId =
        Number(
            decoded.sub
        );

    if (
        !Number.isSafeInteger(
            accountId
        )
    ) {
        return null;
    }

    return accountId;
}


// =========================================================
// POST /player/login
// =========================================================

router.post(
    "/player/login",
    (req, res) => {

        console.log(
            "[MATCH] Player login requested"
        );

        const playerId =
            getAccountId(req);

        if (
            !Number.isSafeInteger(
                playerId
            )
        ) {

            console.log(
                "[MATCH] Player login rejected - invalid account token"
            );

            return res
                .status(401)
                .json({
                    success: false,
                    error: "Unauthorized",
                    value: null
                });
        }

        const sessionToken =
            jwt.sign(
                {
                    sub:
                        String(
                            playerId
                        ),

                    type:
                        "player_session",

                    ver:
                        GAME_VERSION
                },
                JWT_SECRET,
                {
                    expiresIn:
                        3600
                }
            );

        console.log(
            `[MATCH] Player login successful - playerId=${playerId}`
        );

        return res
            .status(200)
            .json({
                success: true,

                error: null,

                value: {
                    sessionToken:
                        sessionToken,

                    playerId:
                        playerId
                }
            });
    }
);


// =========================================================
// POST /player/loginlock
// =========================================================

router.post(
    "/player/loginlock",
    (req, res) => {

        console.log(
            "[MATCH] Player login lock recorded:",
            req.body
                ? req.body.LoginLock
                : undefined
        );

        return res
            .status(200)
            .send();
    }
);


// =========================================================
// GET /player/qos
// =========================================================

router.get(
    "/player/qos",
    (req, res) => {

        console.log(
            "[MATCH] Player QoS probe targets requested"
        );

        return res
            .status(200)
            .json([
                {
                    id:
                        "us-east1",

                    address:
                        "127.0.0.1:5055"
                }
            ]);
    }
);


// =========================================================
// PUT /player/photonregionpings
// =========================================================

router.put(
    "/player/photonregionpings",
    (req, res) => {

        console.log(
            "[MATCH] Player Photon region pings received:",
            req.body
        );

        return res
            .status(200)
            .send();
    }
);

// =========================================================
// GET /player/connection-info
// =========================================================

router.get(
    "/player/connection-info",
    (req, res) => {
        console.log(
            "[MATCH] Photon connection info requested"
        );

        const playerId =
            getAccountId(req);

        if (
            !Number.isSafeInteger(
                playerId
            )
        ) {
            console.log(
                "[MATCH] Photon connection info rejected - invalid account token"
            );

            return res
                .status(401)
                .json({
                    success: false,
                    error: "Unauthorized",
                    value: null
                });
        }

        const roomInstanceId =
            Number(
                req.query.roomInstanceId
            );

        if (
            !Number.isSafeInteger(
                roomInstanceId
            )
        ) {
            console.log(
                "[MATCH] Photon connection info rejected - invalid roomInstanceId"
            );

            return res
                .status(400)
                .json({
                    success: false,
                    error:
                        "Invalid roomInstanceId",
                    value: null
                });
        }

        const photonRoomId =
            String(roomInstanceId);

        console.log(
            "[MATCH] Photon config - " +
            `player=${playerId}, ` +
            `realtime=${PHOTON_REALTIME_APP_ID}, ` +
            `voice=${PHOTON_VOICE_APP_ID}, ` +
            `chat=${PHOTON_CHAT_APP_ID}, ` +
            `region=${PHOTON_REGION}, ` +
            `room=${photonRoomId}, ` +
            `authToken=${PHOTON_AUTH_TOKEN}`
        );

        return res
            .status(200)
            .json({
                success:
                    true,

                error:
                    null,

                value: {
                    experiments:
                        {},

                    photonAuthToken:
                        PHOTON_AUTH_TOKEN,

                    photonChatAppId:
                        PHOTON_CHAT_APP_ID,

                    photonRealtimeAppId:
                        PHOTON_REALTIME_APP_ID,

                    photonRegion:
                        PHOTON_REGION,

                    // Era "" e causava o erro 8707.
                    photonRoomId:
                        photonRoomId,

                    photonVoiceAppId:
                        PHOTON_VOICE_APP_ID,

                    voiceConnectionInfo:
                        "",

                    voiceServerId:
                        ""
                }
            });
    }
);

// =========================================================
// POST /player/heartbeat
// =========================================================

router.post(
    "/player/heartbeat",
    (req, res) => {
        console.log(
            "[MATCH] Player heartbeat received"
        );

        // Precisa ser declarado antes de ser usado nos logs.
        const decoded =
            getDecodedToken(req);

        console.log(
            "[MATCH] Player heartbeat body:",
            JSON.stringify(req.body, null, 2)
        );

        console.log(
            "[MATCH] Player heartbeat token:",
            JSON.stringify(decoded, null, 2)
        );

        let playerId =
            null;

        let platform =
            0;

        let deviceClass =
            0;

        if (
            decoded &&
            decoded.sub !== undefined &&
            decoded.sub !== null
        ) {
            const parsedPlayerId =
                Number(decoded.sub);

            if (
                Number.isSafeInteger(
                    parsedPlayerId
                )
            ) {
                playerId =
                    parsedPlayerId;
            }
        }

        if (
            decoded &&
            decoded.platform !== undefined
        ) {
            const parsedPlatform =
                Number(decoded.platform);

            if (
                Number.isFinite(
                    parsedPlatform
                )
            ) {
                platform =
                    parsedPlatform;
            }
        }

        if (
            decoded &&
            decoded.deviceClass !== undefined
        ) {
            const parsedDeviceClass =
                Number(decoded.deviceClass);

            if (
                Number.isFinite(
                    parsedDeviceClass
                )
            ) {
                deviceClass =
                    parsedDeviceClass;
            }
        }

        const loginLock =
            req.body?.LoginLock;

        const activeRoom =
            loginLock
                ? activeRoomByLoginLock.get(
                    String(loginLock)
                ) ?? null
                : null;

        console.log(
            "[MATCH] Heartbeat LoginLock:",
            loginLock ?? null
        );

        console.log(
            "[MATCH] Heartbeat active room:",
            JSON.stringify(activeRoom, null, 2)
        );

        return res
            .status(200)
            .json({
                appVersion:
                    GAME_VERSION,

                deviceClass:
                    deviceClass,

                errorCode:
                    0,

                experiments:
                    null,

                isOnline:
                    true,

                photonAuthToken:
                    PHOTON_AUTH_TOKEN,

                photonChatAppId:
                    PHOTON_CHAT_APP_ID,

                photonRealtimeAppId:
                    PHOTON_REALTIME_APP_ID,

                photonRegion:
                    activeRoom?.photonRegionId ??
                    PHOTON_REGION,

                photonRoomId:
                    activeRoom?.photonRoomId ??
                    null,

                photonVoiceAppId:
                    PHOTON_VOICE_APP_ID,

                platform:
                    platform,

                playerId:
                    playerId,

                roomInstance:
                    activeRoom,

                statusVisibility:
                    0,

                voiceConnectionInfo:
                    null,

                voiceServerId:
                    null,

                vrMovementMode:
                    0
            });
    }
);

// =========================================================
// POST /player/exclusivelogin
// =========================================================

router.post(
    "/player/exclusivelogin",
    (req, res) => {

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "[MATCH] EXCLUSIVE LOGIN REQUEST"
        );

        console.log(
            "========================================"
        );

        console.log(
            "[MATCH] Method:",
            req.method
        );

        console.log(
            "[MATCH] URL:",
            req.originalUrl
        );

        console.log(
            "[MATCH] Content-Type:",
            req.headers["content-type"] ||
            "<missing>"
        );

        console.log(
            "[MATCH] Content-Length:",
            req.headers["content-length"] ||
            "<missing>"
        );

        console.log(
            "[MATCH] User-Agent:",
            req.headers["user-agent"] ||
            "<missing>"
        );

        console.log(
            "[MATCH] Authorization:",
            req.headers.authorization
                ? "Bearer <present>"
                : "<missing>"
        );

        console.log(
            "[MATCH] Body:"
        );

        console.log(
            JSON.stringify(
                req.body,
                null,
                2
            )
        );

        const decoded =
            getDecodedToken(req);

        console.log(
            "[MATCH] Decoded token:"
        );

        console.log(
            decoded
                ? JSON.stringify(
                    decoded,
                    null,
                    2
                )
                : "<invalid/null>"
        );

        const playerId =
            getAccountId(req);

        console.log(
            "[MATCH] Resolved playerId:",
            playerId
        );

        if (
            !Number.isSafeInteger(
                playerId
            )
        ) {

            console.log(
                "[MATCH] Exclusive login rejected - invalid token"
            );

            console.log(
                "========================================"
            );

            console.log("");

            return res
                .status(401)
                .json({
                    success:
                        false,

                    error:
                        "Unauthorized",

                    value:
                        null
                });
        }

        const loginLock =
            req.body &&
            typeof req.body.LoginLock ===
                "string"
                ? req.body.LoginLock
                : null;

        const takeOverExclusiveSession =
            req.body &&
            req.body.TakeOverExclusiveSession !==
                undefined
                ? String(
                    req.body.TakeOverExclusiveSession
                )
                : null;

        console.log(
            "[MATCH] LoginLock:",
            loginLock
        );

        console.log(
            "[MATCH] TakeOverExclusiveSession:",
            takeOverExclusiveSession
        );

        console.log(
            `[MATCH] Exclusive login accepted - playerId=${playerId}`
        );

        console.log(
            "========================================"
        );

        console.log(
            "[MATCH] END EXCLUSIVE LOGIN REQUEST"
        );

        console.log(
            "========================================"
        );

        console.log("");

        return res
            .status(200)
            .json({
                success:
                    true,

                error:
                    null,

                value:
                    null
            });
    }
);


// =========================================================
// POST /player/logout
// =========================================================

router.post(
    "/player/logout",
    (req, res) => {

        console.log(
            "[MATCH] Player logout requested. Clearing presence."
        );

        return res
            .status(200)
            .send();
    }
);

// =========================================================
// POST /matchmake/dorm
// =========================================================
//
// Hydrium / REC26
// Target runtime: 20231207
//
// Cria a instância do Dorm e associa ela ao LoginLock.
// O mesmo objeto será devolvido posteriormente pelo
// /player/heartbeat.
//
// =========================================================

// Builds a fresh Dorm roomInstance for whoever `req`'s Bearer token belongs to.
// Shared by POST /matchmake/dorm and by /matchmake/none once an account has
// already been through Orientation (see hasOriented/markOriented above).
async function buildDormRoomInstance(req) {
    const instanceId =
        Math.floor(
            Math.random() *
            999999000
        ) + 1000;

    const photonRoomId =
        `hydriumDorm-${instanceId}-room`;

    const decoded =
        getDecodedToken(req);

    let playerId =
        null;

    if (
        decoded &&
        decoded.sub !== undefined &&
        decoded.sub !== null
    ) {
        const parsedPlayerId =
            Number(decoded.sub);

        if (
            Number.isSafeInteger(
                parsedPlayerId
            )
        ) {
            playerId =
                parsedPlayerId;
        }
    }

    let playerName = decoded?.name ?? decoded?.username ?? null;
    if (!playerName && playerId) {
        try {
            const pb = require("./pb");
            const rec = await pb.collection(pb.hydriumCollections.accounts).getFirstListItem(`accountId = ${playerId}`);
            playerName = rec.username || rec.displayName || null;
        } catch (err) {
            console.log("[MATCH] Dorm name lookup failed:", err.message);
        }
    }
    playerName = playerName || "HydriumPlayer";

    const roomInstance = {
        roomInstanceId:
            instanceId,

        gameSessionId:
            instanceId,

        roomId:
            1,

        // Campo utilizado pelo cliente para encontrar
        // o SubRoom correspondente em room.SubRooms.
        subRoomId:
            1,

        // Mantidos por compatibilidade com contratos
        // antigos que usam RoomScene.
        roomSceneId:
            1,

        roomSceneLocationId:
            "76d98498-60a1-430c-ab76-b54a29b7a163",

        name:
            `@${playerName}'s Dorm`,

        location:
            "76d98498-60a1-430c-ab76-b54a29b7a163",

        dataBlob:
            "",

        isPrivate:
            true,

        isSandbox:
            true,

        isFull:
            false,

        gameInProgress:
            false,

        maxCapacity:
            4,

        photonRegion:
            PHOTON_REGION,

        photonRegionId:
            PHOTON_REGION,

        photonRoomId:
            photonRoomId
    };

    return { instanceId, playerId, roomInstance };
}

router.post(
    "/matchmake/dorm",
    async (req, res) => {
        try {
            console.log(
                "[MATCH] Dorm matchmaking requested"
            );

            console.log(
                "[MATCH] Dorm request body:",
                JSON.stringify(req.body, null, 2)
            );

            const loginLock =
                req.body?.LoginLock ??
                req.body?.loginLock ??
                null;

            if (!loginLock) {
                console.log(
                    "[MATCH] Dorm matchmaking rejected - LoginLock missing"
                );

                return res
                    .status(400)
                    .json({
                        errorCode: 1,
                        error:
                            "LoginLock is required",
                        roomInstance:
                            null
                    });
            }

            const { playerId, roomInstance } =
                await buildDormRoomInstance(req);

            activeRoomByLoginLock.set(
                String(loginLock),
                roomInstance
            );

            console.log(
                "[MATCH] Dorm instance stored:",
                JSON.stringify(
                    {
                        loginLock:
                            String(loginLock),
                        playerId:
                            playerId,
                        roomInstance:
                            roomInstance
                    },
                    null,
                    2
                )
            );

            const response = {
                errorCode:
                    0,

                roomInstance:
                    roomInstance
            };

            console.log(
                "[MATCH] Dorm matchmaking response:",
                JSON.stringify(
                    response,
                    null,
                    2
                )
            );

            return res
                .status(200)
                .json(response);
        } catch (error) {
            console.error(
                "[MATCH] Dorm matchmaking error:",
                error
            );

            return res
                .status(500)
                .json({
                    errorCode:
                        1,
                    error:
                        "Dorm matchmaking failed",
                    roomInstance:
                        null
                });
        }
    }
);

// =========================================================
// POST /photon/auth
// =========================================================

router.post(
    "/photon/auth",
    (req, res) => {
        console.log(
            "[PHOTON AUTH] Request received"
        );

        let token = "";

        if (Buffer.isBuffer(req.body)) {
            token = req.body
                .toString("utf8")
                .trim();
        } else if (
            typeof req.body === "string"
        ) {
            token = req.body.trim();
        } else if (
            req.body &&
            typeof req.body === "object"
        ) {
            token =
                req.body.token ??
                req.body.Token ??
                req.body.authToken ??
                "";
        }

        console.log(
            "[PHOTON AUTH] Token:",
            token
        );

        if (
            token !== PHOTON_AUTH_TOKEN
        ) {
            console.warn(
                "[PHOTON AUTH] Invalid token"
            );

            return res
                .status(200)
                .json({
                    ResultCode: 2,
                    Message:
                        "Invalid authentication token"
                });
        }

        const response = {
            ResultCode: 1,
            UserId: "108146957",
            Nickname: "HydriumPlayer"
        };

        console.log(
            "[PHOTON AUTH] Success:",
            JSON.stringify(response)
        );

        return res
            .status(200)
            .json(response);
    }
);

// =========================================================
// POST /roominstance/:roomInstanceId/reportjoinresult
// =========================================================

router.post(
    "/roominstance/:roomInstanceId/reportjoinresult",
    (req, res) => {
        const roomInstanceId =
            Number(req.params.roomInstanceId);

        const result =
            Number(req.body?.result);

        console.log(
            "[MATCH] Room join result:",
            JSON.stringify(
                {
                    roomInstanceId:
                        roomInstanceId,
                    result:
                        result
                },
                null,
                2
            )
        );

        return res
            .status(200)
            .end();
    }
);

// =========================================================
// GET /photon_access_token
// =========================================================

router.get("/photon_access_token", (req, res) => {
    console.log("[MATCH] Photon access token requested");

    const activeRooms =
        Array.from(activeRoomByLoginLock.values());

    const activeRoom =
        activeRooms.length > 0
            ? activeRooms[activeRooms.length - 1]
            : null;

    const roomInstanceId =
        activeRoom?.roomInstanceId ??
        activeRoom?.roomInstance?.roomInstanceId ??
        null;

    const response = {
        Permissions: [],
        PhotonAccessToken: "",
        RoomInstanceId: roomInstanceId
    };

    console.log(
        "[MATCH] Photon access token response:",
        response
    );

    return res.status(200).json(response);
});

// =========================================================
// POST /matchmake/none
// Initial lifecycle destination: Orientation
// =========================================================

router.post("/matchmake/none", async (req, res) => {
    console.log("[MATCH] Matchmake none requested");
    console.log("[MATCH] Matchmake none body:", req.body);

    const loginLock =
        req.body?.LoginLock ??
        req.body?.loginLock;

    if (!loginLock) {
        return res.status(400).json({
            errorCode: 1,
            roomInstance: null
        });
    }

    const normalizedLoginLock =
        String(loginLock);

    // Only brand-new accounts (or ones we have no record for yet) go to
    // Orientation. Everyone else used to get sent back here too -- every
    // /matchmake/none call rebuilt a fresh Orientation instance regardless of
    // whether the account had already been through it, which is why the
    // Coach kept showing up for returning players. Once an account's been
    // through it, route it to its Dorm instead, same as /matchmake/dorm.
    const decoded = getDecodedToken(req);
    const accountId = decoded && decoded.sub !== undefined && decoded.sub !== null && Number.isSafeInteger(Number(decoded.sub))
        ? Number(decoded.sub)
        : null;

    if (accountId !== null && hasOriented(accountId)) {
        try {
            const { roomInstance } = await buildDormRoomInstance(req);
            activeRoomByLoginLock.set(normalizedLoginLock, roomInstance);
            console.log(`[MATCH] Matchmake none: account ${accountId} already oriented -> Dorm instead of Orientation`);
            return res.status(200).json({ errorCode: 0, roomInstance });
        } catch (error) {
            console.error("[MATCH] Matchmake none (post-orientation) error:", error);
            return res.status(500).json({ errorCode: 1, error: "Matchmaking failed", roomInstance: null });
        }
    }

    const roomInstanceId =
        Math.floor(
            Math.random() * 900000000
        ) + 1000000;

    const roomInstance = {
        roomInstanceId: roomInstanceId,
        gameSessionId: roomInstanceId,

        roomId: 13,
        subRoomId: 23,
        roomSceneId: 23,

        roomSceneLocationId:
            "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

        name: "Orientation",

        location:
            "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

        dataBlob: "",

        isPrivate: true,
        isSandbox: false,
        isFull: false,
        gameInProgress: false,

        maxCapacity: 1,

        photonRegion: PHOTON_REGION,
        photonRegionId: PHOTON_REGION,

        photonRoomId:
            `hydriumOrientation-${roomInstanceId}-room`
    };

    activeRoomByLoginLock.set(
        normalizedLoginLock,
        roomInstance
    );

    if (accountId !== null) markOriented(accountId);

    console.log(
        "[MATCH] Orientation instance created:",
        JSON.stringify(roomInstance, null, 2)
    );

    return res.status(200).json({
        errorCode: 0,
        roomInstance: roomInstance
    });
});

// =========================================================
// POST /matchmake/room/:roomId
// =========================================================

// This used to answer 404 for every roomId except 13 (Orientation) -- it never actually
// looked any other room up, so any door/teleporter/menu entry in RecCenter (or any other
// room) that matchmakes by roomId instead of going through /matchmake/dorm or
// /matchmake/none just failed outright. It now looks the room up via hydrium-rooms'
// allRooms() (RecCenter, the RROs, and player rooms all live there) and builds a real
// instance from its first subroom, or a specific one if the client names SubRoomId/
// subRoomId in the body. Orientation (roomId 13) isn't in that registry -- match.js
// manages it itself, same as /matchmake/none -- so it's kept as its own case below.
router.post("/matchmake/room/:roomId", (req, res) => {
    const roomId = Number(req.params.roomId);
    const loginLock =
        req.body?.LoginLock ??
        req.body?.loginLock;

    console.log(
        `[MATCH] Room matchmaking requested - roomId=${roomId}`
    );

    const roomInstanceId =
        Math.floor(
            Math.random() * 900000000
        ) + 1000000;

    if (roomId === 13) {
        const roomInstance = {
            roomInstanceId: roomInstanceId,
            gameSessionId: roomInstanceId,
            roomId: 13,
            subRoomId: 23,
            roomSceneId: 23,
            roomSceneLocationId:
                "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",
            location:
                "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",
            name: "Orientation",
            photonRegionId: PHOTON_REGION,
            photonRegion: PHOTON_REGION,
            photonRoomId:
                `hydriumOrientation-${roomInstanceId}-room`,
            isSandbox: false,
            dataBlob: "",
            isPrivate: true,
            isFull: false,
            gameInProgress: false,
            maxCapacity: 1
        };

        if (loginLock) {
            activeRoomByLoginLock.set(String(loginLock), roomInstance);
        }

        return res.status(200).json({ errorCode: 0, roomInstance });
    }

    let room = null;
    try {
        room = require("./hydrium-rooms").allRooms().get(roomId) || null;
    } catch (err) {
        console.log("[MATCH] Room matchmaking: hydrium-rooms lookup failed:", err.message);
    }

    if (!room) {
        console.log(`[MATCH] Room matchmaking rejected - no such room ${roomId}`);
        return res.status(404).json({ errorCode: 1, roomInstance: null });
    }

    const subRooms = Array.isArray(room.SubRooms) ? room.SubRooms : [];
    const requestedSubId = Number(req.body?.SubRoomId ?? req.body?.subRoomId);
    const sub =
        (Number.isSafeInteger(requestedSubId) ? subRooms.find((s) => s.SubRoomId === requestedSubId) : null) ||
        subRooms[0] ||
        null;

    if (!sub) {
        console.log(`[MATCH] Room matchmaking rejected - room ${roomId} has no subrooms`);
        return res.status(404).json({ errorCode: 1, roomInstance: null });
    }

    const roomInstance = {
        roomInstanceId: roomInstanceId,
        gameSessionId: roomInstanceId,
        roomId: room.RoomId,
        subRoomId: sub.SubRoomId,
        roomSceneId: sub.SubRoomId,
        roomSceneLocationId: sub.UnitySceneId || "",
        location: sub.UnitySceneId || "",
        name: room.Name,
        dataBlob: sub.DataBlob || "",
        isPrivate: room.IsDorm === true,
        isSandbox: !!sub.IsSandbox,
        isFull: false,
        gameInProgress: false,
        maxCapacity: sub.MaxPlayers || room.MaxPlayers || 4,
        photonRegion: PHOTON_REGION,
        photonRegionId: PHOTON_REGION,
        photonRoomId: `hydriumRoom-${roomInstanceId}-room`
    };

    if (loginLock) {
        activeRoomByLoginLock.set(String(loginLock), roomInstance);
    }

    console.log(
        "[MATCH] Room instance created:",
        JSON.stringify({ roomId, requestedSubId: Number.isSafeInteger(requestedSubId) ? requestedSubId : null, roomInstance }, null, 2)
    );

    return res.status(200).json({ errorCode: 0, roomInstance });
});

// =========================================================
// EXPORT
// =========================================================

router.activeRoomByLoginLock = activeRoomByLoginLock;

module.exports = router;