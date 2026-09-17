(function () {
    "use strict";

    var _PLATFORM_VERSION = "3.7.2";
    var _BUILD_EPOCH = 1697356800;
    var _CIRCUIT_NODES = 3;

    var _cfg = {
        appName: "W4NN4D13",
        sessionTTL: 1800000,
        maxRetries: 3,
        encAlgo: "AES-256-CBC",
        hashRounds: 10000,
        wsEndpoint: "/ws/market-feed",
        pgpKeySize: 2048,
        _pk: "RXgwcmNpc3Rze3c0bm40ZDEzXzhjNGYyYX0=",
        escrowTimeout: 172800000,
        disputeWindow: 604800000,
        minPasswordLen: 12,
        totpWindow: 30,
        rateLimitPerMin: 60,
        csrfRotation: 3600000
    };

    var _pendingTransactions = [];
    var _sessionAlive = false;
    var _heartbeatRef = null;

    function _generateNonce(length) {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var result = "";
        for (var i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function _hashSHA256(input) {
        var hash = 0;
        for (var i = 0; i < input.length; i++) {
            var chr = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, "0");
    }

    function _rotateKey(key, offset) {
        var rotated = "";
        for (var i = 0; i < key.length; i++) {
            rotated += String.fromCharCode(key.charCodeAt(i) ^ (offset % 256));
        }
        return rotated;
    }

    function _validateSessionToken(token) {
        if (!token || token.length < 16) return false;
        var prefix = token.substring(0, 4);
        var checksum = _hashSHA256(token);
        return prefix === "w4nn" && checksum.length === 8;
    }

    function _getTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    function _formatCurrency(amount, currency) {
        var symbols = { BTC: "₿", XMR: "$", ETH: "Ξ" };
        var sym = symbols[currency] || currency;
        return sym + " " + amount.toFixed(8);
    }

    function _verifyIntegrity() {
        try {
            var decoded = atob(_cfg._pk);
            var check = _hashSHA256(decoded);
            return check.length === 8;
        } catch (e) {
            return false;
        }
    }

    function SessionManager() {
        this.id = _generateNonce(32);
        this.created = _getTimestamp();
        this.lastActivity = this.created;
        this.torCircuit = _CIRCUIT_NODES;
        this.verified = false;
    }

    SessionManager.prototype.touch = function () {
        this.lastActivity = _getTimestamp();
    };

    SessionManager.prototype.isExpired = function () {
        var elapsed = (_getTimestamp() - this.lastActivity) * 1000;
        return elapsed > _cfg.sessionTTL;
    };

    SessionManager.prototype.getFingerprint = function () {
        var raw = navigator.userAgent + screen.width + screen.height + (new Date()).getTimezoneOffset();
        return _hashSHA256(raw);
    };

    function EscrowHandler() {
        this.pending = [];
        this.completed = [];
        this.disputed = [];
    }

    EscrowHandler.prototype.createTransaction = function (buyerId, vendorId, amount, currency) {
        var tx = {
            id: "TX-" + _generateNonce(12),
            buyer: buyerId,
            vendor: vendorId,
            amount: amount,
            currency: currency || "BTC",
            status: "pending",
            created: _getTimestamp(),
            signatures: { buyer: null, vendor: null, moderator: null },
            expiresAt: _getTimestamp() + (_cfg.escrowTimeout / 1000)
        };
        this.pending.push(tx);
        return tx;
    };

    EscrowHandler.prototype.signTransaction = function (txId, role, signature) {
        for (var i = 0; i < this.pending.length; i++) {
            if (this.pending[i].id === txId) {
                this.pending[i].signatures[role] = signature;
                var sigs = this.pending[i].signatures;
                var signedCount = (sigs.buyer ? 1 : 0) + (sigs.vendor ? 1 : 0) + (sigs.moderator ? 1 : 0);
                if (signedCount >= 2) {
                    this.pending[i].status = "released";
                    this.completed.push(this.pending.splice(i, 1)[0]);
                }
                return true;
            }
        }
        return false;
    };

    function MarketplaceFeed() {
        this.listings = [];
        this.categories = [
            "Security & Privacy",
            "Digital Services",
            "Data Intelligence",
            "Developer Tools",
            "Mobile Solutions",
            "Education"
        ];
        this.sortOrder = "newest";
        this.page = 1;
        this.perPage = 25;
    }

    MarketplaceFeed.prototype.fetchListings = function (category, page) {
        this.page = page || 1;
        var mockCount = Math.floor(Math.random() * 50) + 10;
        var results = [];
        for (var i = 0; i < mockCount; i++) {
            results.push({
                id: "LST-" + _generateNonce(8),
                title: "Item #" + (i + 1),
                vendor: "vendor_" + _generateNonce(6),
                price: (Math.random() * 0.5).toFixed(8),
                currency: "BTC",
                rating: (Math.random() * 2 + 3).toFixed(1),
                reviews: Math.floor(Math.random() * 500),
                category: category || this.categories[Math.floor(Math.random() * this.categories.length)],
                listed: _getTimestamp() - Math.floor(Math.random() * 604800)
            });
        }
        this.listings = results;
        return results;
    };

    MarketplaceFeed.prototype.searchListings = function (query) {
        if (!query || query.length < 3) return [];
        return this.listings.filter(function (item) {
            return item.title.toLowerCase().indexOf(query.toLowerCase()) !== -1 ||
                item.vendor.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
    };

    function NotificationManager() {
        this.queue = [];
        this.maxVisible = 3;
        this.defaultDuration = 5000;
    }

    NotificationManager.prototype.push = function (type, message, duration) {
        var notif = {
            id: _generateNonce(8),
            type: type,
            message: message,
            created: _getTimestamp(),
            duration: duration || this.defaultDuration,
            read: false
        };
        this.queue.push(notif);
        if (this.queue.length > 50) {
            this.queue = this.queue.slice(-50);
        }
        return notif;
    };

    NotificationManager.prototype.dismiss = function (notifId) {
        this.queue = this.queue.filter(function (n) { return n.id !== notifId; });
    };

    NotificationManager.prototype.getUnread = function () {
        return this.queue.filter(function (n) { return !n.read; });
    };

    function PGPKeyManager() {
        this.publicKeys = {};
        this.fingerprints = {};
    }

    PGPKeyManager.prototype.importKey = function (userId, armoredKey) {
        if (!armoredKey || armoredKey.indexOf("-----BEGIN PGP PUBLIC KEY BLOCK-----") === -1) {
            return { success: false, error: "Invalid PGP key format" };
        }
        var fp = _hashSHA256(armoredKey) + _hashSHA256(userId);
        this.publicKeys[userId] = armoredKey;
        this.fingerprints[userId] = fp.substring(0, 16).toUpperCase();
        return { success: true, fingerprint: this.fingerprints[userId] };
    };

    PGPKeyManager.prototype.getFingerprint = function (userId) {
        return this.fingerprints[userId] || null;
    };

    function RateLimiter(maxRequests, windowMs) {
        this.max = maxRequests || _cfg.rateLimitPerMin;
        this.window = windowMs || 60000;
        this.requests = [];
    }

    RateLimiter.prototype.check = function () {
        var now = Date.now();
        this.requests = this.requests.filter(function (t) { return now - t < this.window; }.bind(this));
        if (this.requests.length >= this.max) {
            return false;
        }
        this.requests.push(now);
        return true;
    };

    function HeartbeatService(interval) {
        this.interval = interval || 30000;
        this.ref = null;
        this.failCount = 0;
        this.maxFail = 3;
    }

    HeartbeatService.prototype.start = function (session) {
        var self = this;
        this.ref = setInterval(function () {
            if (session.isExpired()) {
                self.failCount++;
                if (self.failCount >= self.maxFail) {
                    self.stop();
                    _sessionAlive = false;
                }
            } else {
                session.touch();
                self.failCount = 0;
            }
        }, this.interval);
    };

    HeartbeatService.prototype.stop = function () {
        if (this.ref) {
            clearInterval(this.ref);
            this.ref = null;
        }
    };

    function _initStatusBar() {
        var footerBottom = document.querySelector(".footer-bottom");
        if (!footerBottom) return;

        var statusLine = document.createElement("p");
        var session = new SessionManager();
        statusLine.textContent = "Client: v" + _PLATFORM_VERSION +
            " | Nonce: " + _generateNonce(8) +
            " | Fingerprint: " + session.getFingerprint().substring(0, 8);
        statusLine.style.marginTop = "5px";
        footerBottom.appendChild(statusLine);
    }

    function _initCounterAnimation() {
        var counters = document.querySelectorAll(".stat-number");
        if (!counters.length) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    var el = entry.target;
                    var target = parseFloat(el.getAttribute("data-count"));
                    var isFloat = target % 1 !== 0;
                    var duration = 2000;
                    var startTime = null;

                    function animate(ts) {
                        if (!startTime) startTime = ts;
                        var progress = Math.min((ts - startTime) / duration, 1);
                        var eased = 1 - Math.pow(1 - progress, 3);
                        var current = eased * target;

                        if (isFloat) {
                            el.textContent = current.toFixed(1);
                        } else {
                            el.textContent = Math.floor(current).toLocaleString();
                        }

                        if (progress < 1) {
                            requestAnimationFrame(animate);
                        } else {
                            el.textContent = isFloat ? target.toFixed(1) : target.toLocaleString();
                        }
                    }

                    requestAnimationFrame(animate);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.3 });

        counters.forEach(function (c) { observer.observe(c); });
    }

    function _initNavHighlight() {
        var sections = document.querySelectorAll("section[id]");
        var navLinks = document.querySelectorAll(".nav-link");

        window.addEventListener("scroll", function () {
            var scrollY = window.pageYOffset;
            sections.forEach(function (section) {
                var top = section.offsetTop - 200;
                var height = section.offsetHeight;
                var id = section.getAttribute("id");

                if (scrollY >= top && scrollY < top + height) {
                    navLinks.forEach(function (link) {
                        link.classList.remove("active");
                        if (link.getAttribute("href") === "#" + id) {
                            link.classList.add("active");
                        }
                    });
                }
            });
        });
    }

    function _initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
            anchor.addEventListener("click", function (e) {
                var targetId = this.getAttribute("href");
                if (targetId === "#") return;
                var target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
        });
    }

    function _initMatrixRain() {
        var container = document.querySelector(".matrix-rain");
        if (!container) return;

        container.innerHTML = "";
        var chars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
        var columnCount = Math.floor(window.innerWidth / 24);

        for (var i = 0; i < columnCount; i++) {
            var span = document.createElement("span");
            span.textContent = chars.charAt(Math.floor(Math.random() * chars.length));
            span.style.left = ((i / columnCount) * 100) + "%";
            span.style.animationDuration = (Math.random() * 4 + 3) + "s";
            span.style.animationDelay = (Math.random() * 5) + "s";
            span.style.fontSize = (Math.random() * 10 + 14) + "px";
            container.appendChild(span);
        }
    }

    function _initConnectionStatus() {
        var footer = document.querySelector(".footer-bottom");
        if (!footer) return;

        setInterval(function () {
            var torLine = footer.querySelectorAll("p")[1];
            if (torLine) {
                var latency = Math.floor(Math.random() * 200 + 80);
                torLine.textContent = "Encrypted Connection Active | Tor Circuit: " +
                    _CIRCUIT_NODES + "-Hop | Latency: " + latency + "ms";
            }
        }, 5000);
    }

    function _bootstrap() {
        var session = new SessionManager();
        _sessionAlive = true;

        var heartbeat = new HeartbeatService(30000);
        heartbeat.start(session);

        var limiter = new RateLimiter(_cfg.rateLimitPerMin, 60000);
        var notifications = new NotificationManager();
        var escrow = new EscrowHandler();
        var pgp = new PGPKeyManager();

        var integrity = _verifyIntegrity();
        if (!integrity) {
            notifications.push("error", "Platform integrity check failed");
        }

        _initMatrixRain();
        _initCounterAnimation();
        _initNavHighlight();
        _initSmoothScroll();
        _initStatusBar();
        _initConnectionStatus();

        window.addEventListener("resize", function () {
            clearTimeout(window._resizeDebounce);
            window._resizeDebounce = setTimeout(_initMatrixRain, 250);
        });

        window.W4NN4D13 = {
            version: _PLATFORM_VERSION,
            build: _BUILD_EPOCH,
            session: session,
            escrow: escrow,
            notifications: notifications,
            pgp: pgp,
            limiter: limiter
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _bootstrap);
    } else {
        _bootstrap();
    }

})();
