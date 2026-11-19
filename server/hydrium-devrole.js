"use strict";

// Hydrium - launcher support: GET /role/developer/<accountId>
// The Hydrium launcher (https://github.com/Nexus-Industries-Official/Hydrium/tree/main/Launcher) signs in
// through your existing /connect/token (grant_type=password, same as any RecFlare-shaped auth service),
// then calls this route to show "Role: Developer" / "Role: Player". It just returns a JSON boolean.
//
// A developer is whatever hydrium-devedit.js already treats as one: the caller's own JWT must carry
// role: "developer" (or "admin") -- that's set by your auth service at login, same claim hydrium-devedit
// reads. This route does NOT grant the role; it only reports it, and only for the signed-in caller's
// own account id (so one player can't query another's role).
//
// Mount it anywhere after your auth/body-parser setup, order doesn't matter relative to other modules:
//   app.use(require("./hydrium-devrole").router);

const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

function claims(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try { return jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET, { algorithms: ["HS256"] }); } catch { return null; }
}
function isDeveloper(d) {
    const roles = [].concat(d.role || []).flatMap((r) => String(r).toLowerCase().split(/[,\s]+/));
    return roles.includes("developer") || roles.includes("admin");
}

router.get(/^\/role\/developer\/(\d+)$/, (req, res) => {
    const d = claims(req);
    if (!d) return res.status(401).json({ error: "Unauthorized" });
    const me = Number(d.sub), asked = Number(req.params[0]);
    if (!Number.isSafeInteger(me) || me <= 0) return res.status(401).json({ error: "Unauthorized" });
    if (asked !== me) return res.status(403).json({ error: "Forbidden" }); // only your own role is visible here
    res.json(isDeveloper(d));
});

module.exports = { router };