$(function() {
    // ── Accent color ──────────────────────────────────────────
    function applyAccentColor(hex) {
        if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const root = document.documentElement;
        root.style.setProperty('--accent',       hex);
        root.style.setProperty('--accent-dark',  `rgb(${Math.round(r*.85)},${Math.round(g*.85)},${Math.round(b*.85)})`);
        root.style.setProperty('--accent-light', `rgb(${Math.min(255,Math.round(r*1.12))},${Math.min(255,Math.round(g*1.12))},${Math.min(255,Math.round(b*1.12))})`);
        root.style.setProperty('--accent-rgb',   `${r},${g},${b}`);
    }

    let editMode = false;
    let currentShopId = null;
    let positionCounter = 0;
    let itemCounter = 0;
    let serverItems = [];
    let allShops = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let isDarkTheme = true;
    let detectedFramework = "esx"; // updated when server responds

    // ── Virtual-scroll state ──────────────────────────────────
    let vsItems    = [];
    let vsSelected = new Set();
    const VS_ITEM_H  = 96;   // px height per row
    const VS_COLS    = 4;
    const VS_OVERSCAN = 3;

    // ── Notifications ─────────────────────────────────────────
    function showNotification(message, type = "error") {
        const icons = { error: "✕", success: "✓", warning: "⚠", info: "ℹ" };
        const notification = $(`
            <div class="notification ${type}">
                <div class="notification-icon">${icons[type] || icons.error}</div>
                <div class="notification-message">${message}</div>
            </div>
        `);
        $("#notification-container").append(notification);
        setTimeout(() => notification.fadeOut(300, function() { $(this).remove(); }), 3000);
    }

    // ── Confirmation modal ────────────────────────────────────
    function showConfirm(title, message, onConfirm) {
        $("#confirm-title").text(title);
        $("#confirm-message").text(message);
        $("#confirm-modal").fadeIn(200);
        $("#confirm-ok").off("click").on("click", function() {
            $("#confirm-modal").fadeOut(200);
            if (onConfirm) onConfirm();
        });
        $("#confirm-cancel").off("click").on("click", function() {
            $("#confirm-modal").fadeOut(200);
        });
    }

    // ── Dashboard ─────────────────────────────────────────────
    function updateDashboard() {
        if (!allShops || allShops.length === 0) {
            $("#total-shops, #total-items, #total-locations").text("0");
            return;
        }
        let totalItems = 0, totalLocations = 0;
        allShops.forEach(shop => {
            if (shop.Items) totalItems += shop.Items.length;
            if (shop.Pos)   totalLocations += shop.Pos.length;
        });
        $("#total-shops").text(allShops.length);
        $("#total-items").text(totalItems);
        $("#total-locations").text(totalLocations);
        $.post("https://flake_shops/requestAllShopsAnalytics", JSON.stringify({}));
    }

    // ── NUI message listener ──────────────────────────────────
    window.addEventListener("message", function(event) {
        const data = event.data;
        if (data.type === "openShopAdmin") {
            if (data.uiColor) applyAccentColor(data.uiColor);
            editMode = data.editMode || false;
            currentShopId = data.shopId || null;
            $("#admin-wrapper").fadeIn();
            if (data.playerName) $("#user-name").text(data.playerName);
            if (data.playerId)   $("#user-id").text(data.playerId);
            if (data.playerAvatar) $("#user-avatar").attr("src", data.playerAvatar);
            $.post("https://flake_shops/requestShops", JSON.stringify({}), function(shops) {
                allShops = shops || [];
                renderShopsTable();
                updateDashboard();
            });
            $.post("https://flake_shops/getFramework", JSON.stringify({}));
            if (editMode && data.shopData) openShopModal(data.shopData);
        } else if (data.type === "closeShopAdmin") {
            $("#admin-wrapper").fadeOut();
        } else if (data.type === "frameworkDetected") {
            detectedFramework = data.framework || "esx";
        } else if (data.type === "analyticsData") {
            updateAnalyticsDisplay(data.analytics);
        } else if (data.type === "showAnalytics") {
            showShopAnalyticsModal(data.analytics);
        }
    });

    // ── Theme toggle ──────────────────────────────────────────
    $("#theme-toggle").on("click", function() {
        isDarkTheme = !isDarkTheme;
        if (isDarkTheme) {
            $(this).html('<i class="fas fa-moon"></i>').removeClass("light");
            $("body").removeClass("light-theme");
        } else {
            $(this).html('<i class="fas fa-sun"></i>').addClass("light");
            $("body").addClass("light-theme");
        }
    });

    // ── Shops table ───────────────────────────────────────────
    function renderShopsTable() {
        const tbody = $("#shops-table-body");
        tbody.empty();
        if (!allShops || allShops.length === 0) {
            tbody.append('<tr><td colspan="4" class="no-data">No shops found. Click "Create New Shop" to get started.</td></tr>');
            return;
        }
        const start = (currentPage - 1) * itemsPerPage;
        const end   = start + itemsPerPage;
        allShops.slice(start, end).forEach(shop => {
            const itemCount = shop.Items ? shop.Items.length : 0;
            const shopLabel = shop.ShopLogo ? shop.ShopLogo.replace('.png','').replace(/[_-]/g,' ') : shop.name;
            tbody.append(`
                <tr>
                    <td>${shop.name}</td>
                    <td>${shopLabel}</td>
                    <td>${itemCount}</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn analytics" data-shop-name="${shop.name}">
                                <i class="fas fa-chart-bar"></i> Analytics
                            </button>
                            <button class="action-btn goto" data-pos='${JSON.stringify(shop.Pos && shop.Pos[0] ? shop.Pos[0] : {}).replace(/'/g,"&#39;")}'>
                                <i class="fas fa-location-arrow"></i> Goto
                            </button>
                            <button class="action-btn edit" data-shop='${JSON.stringify(shop).replace(/'/g,"&#39;")}'>Edit</button>
                            <button class="action-btn delete" data-shop-name="${shop.name}">Delete</button>
                        </div>
                    </td>
                </tr>
            `);
        });
        $("#current-page").text(currentPage);
        $("#prev-page").prop("disabled", currentPage === 1);
        $("#next-page").prop("disabled", end >= allShops.length);
    }

    $("body").on("click", ".action-btn.analytics", function() {
        const shopName = $(this).attr("data-shop-name");
        $.post("https://flake_shops/requestShopAnalytics", JSON.stringify({ shopName }));
        showNotification(`Loading analytics for ${shopName}...`, "info");
    });

    $("body").on("click", ".action-btn.goto", function() {
        try {
            const pos = JSON.parse($(this).attr("data-pos").replace(/&#39;/g, "'"));
            if (pos && pos.x !== undefined) {
                $.post("https://flake_shops/gotoShopPosition", JSON.stringify({ x: pos.x, y: pos.y, z: pos.z }));
                showNotification("Teleporting to shop location...", "info");
            } else {
                showNotification("No position set for this shop.", "error");
            }
        } catch(e) {
            showNotification("Could not parse shop position.", "error");
        }
    });

    $("#shops-search").on("input", function() {
        const term = $(this).val().toLowerCase();
        const tbody = $("#shops-table-body");
        tbody.empty();
        const filtered = term
            ? allShops.filter(s => s.name.toLowerCase().includes(term) ||
                (s.ShopLogo && s.ShopLogo.toLowerCase().includes(term)))
            : allShops;
        if (!filtered.length) {
            tbody.append('<tr><td colspan="4" class="no-data">No shops match your search.</td></tr>');
            return;
        }
        filtered.forEach(shop => {
            const itemCount = shop.Items ? shop.Items.length : 0;
            const shopLabel = shop.ShopLogo ? shop.ShopLogo.replace('.png','').replace(/[_-]/g,' ') : shop.name;
            tbody.append(`
                <tr>
                    <td>${shop.name}</td>
                    <td>${shopLabel}</td>
                    <td>${itemCount}</td>
                    <td>
                        <div class="table-actions">
                            <button class="action-btn analytics" data-shop-name="${shop.name}">
                                <i class="fas fa-chart-bar"></i> Analytics
                            </button>
                            <button class="action-btn goto" data-pos='${JSON.stringify(shop.Pos && shop.Pos[0] ? shop.Pos[0] : {}).replace(/'/g,"&#39;")}'>
                                <i class="fas fa-location-arrow"></i> Goto
                            </button>
                            <button class="action-btn edit" data-shop='${JSON.stringify(shop).replace(/'/g,"&#39;")}'>Edit</button>
                            <button class="action-btn delete" data-shop-name="${shop.name}">Delete</button>
                        </div>
                    </td>
                </tr>
            `);
        });
    });

    $("#prev-page").on("click", function() { if (currentPage > 1) { currentPage--; renderShopsTable(); } });
    $("#next-page").on("click", function() {
        if (currentPage < Math.ceil(allShops.length / itemsPerPage)) { currentPage++; renderShopsTable(); }
    });

    $("body").on("click", ".action-btn.edit", function() {
        openShopModal(JSON.parse($(this).attr("data-shop")));
    });
    $("body").on("click", ".action-btn.delete", function() {
        const shopName = $(this).attr("data-shop-name");
        showConfirm("Delete Shop", `Permanently delete "${shopName}"? This cannot be undone.`, function() {
            $.post("https://flake_shops/deleteShop", JSON.stringify({ shopName }), function() {
                showNotification(`Shop "${shopName}" deleted!`, "success");
                $.post("https://flake_shops/requestShops", JSON.stringify({}), function(shops) {
                    allShops = shops || [];
                    renderShopsTable();
                    updateDashboard();
                });
            });
        });
    });

    // ── Sidebar nav ───────────────────────────────────────────
    $(".nav-item").on("click", function(e) {
        e.preventDefault();
        const page = $(this).attr("data-page");
        $(".nav-item").removeClass("active");
        $(this).addClass("active");
        $(".content-page").removeClass("active");
        $(`#${page}-page`).addClass("active");
    });

    // ── Shop modal ────────────────────────────────────────────
    $("#create-new-shop").on("click", function() { openShopModal(null); });

    function openShopModal(shopData) {
        resetForm();
        if (shopData) {
            editMode = true;
            currentShopId = shopData.name;
            $("#modal-title").text("Edit Shop");
            $("#delete-shop").show();
            loadShopData(shopData);
        } else {
            editMode = false;
            currentShopId = null;
            $("#modal-title").text("Create New Shop");
            $("#delete-shop").hide();
        }
        $("#shop-modal").fadeIn(200);
    }

    $("#close-modal, #cancel-modal").on("click", function() { $("#shop-modal").fadeOut(200); });

    $(".tab-btn").on("click", function() {
        const tab = $(this).attr("data-tab");
        $(".tab-btn").removeClass("active");
        $(this).addClass("active");
        $(".tab-pane").removeClass("active");
        $(`.tab-pane[data-tab="${tab}"]`).addClass("active");
    });

    $(".items-tab-btn").on("click", function() {
        const tab = $(this).attr("data-items-tab");
        $(".items-tab-btn").removeClass("active");
        $(this).addClass("active");
        $(".items-tab-pane").removeClass("active");
        $(`.items-tab-pane[data-items-tab="${tab}"]`).addClass("active");
    });

    function resetForm() {
        $("#shop-name").val("").prop("disabled", false);
        $("#shop-logo").val("blackmarket.png");
        $("#positions-list, #items-list").empty();
        $(".currency-check").prop("checked", false);
        $("#use-pickup, #use-ped, #use-blip").prop("checked", false);
        $("#blip-settings").hide();
        positionCounter = itemCounter = 0;
        $(".tab-btn").removeClass("active");
        $(".tab-btn[data-tab='basic']").addClass("active");
        $(".tab-pane").removeClass("active");
        $(".tab-pane[data-tab='basic']").addClass("active");
        renderCurrencyOptions();
        setBlipSprite(52);
        setBlipColour(2);
    }

    function renderCurrencyOptions() {
        const fwMap = {
            qbcore: [
                { value: "cash",         label: "Cash" },
                { value: "bank",         label: "Bank" },
                { value: "crypto",       label: "Crypto" },
                { value: "black_money",  label: "Black Money" },
                { value: "blackdiamond", label: "Black Diamond" },
            ],
            esx: [
                { value: "money",        label: "Cash" },
                { value: "bank",         label: "Bank" },
                { value: "black_money",  label: "Black Money" },
                { value: "blackdiamond", label: "Black Diamond" },
            ],
        };
        const currencies = fwMap[detectedFramework] || fwMap.esx;
        const html = currencies.map(c =>
            `<label><input type="checkbox" class="currency-check" value="${c.value}"> ${c.label}</label>`
        ).join('');
        $("#currency-list").html(html);
    }

    function loadShopData(shopData) {
        $("#shop-name").val(shopData.name).prop("disabled", true);
        $("#shop-logo").val(shopData.ShopLogo || "blackmarket.png");
        if (shopData.Pos) shopData.Pos.forEach(pos => addPositionEntry(pos.x, pos.y, pos.z, pos.heading, !!pos.useHeading));
        if (shopData.Items) shopData.Items.forEach(item => addItemEntry(item.label, item.item, item.price));
        if (shopData.Currency) shopData.Currency.forEach(c => $(`.currency-check[value="${c}"]`).prop("checked", true));
        $("#use-pickup").prop("checked", shopData.UsePickup || false);
        $("#use-ped").prop("checked", shopData.UsePed || false);
        if (shopData.ShopPed) {
            $("#ped-model").val(shopData.ShopPed.model || "");
            $("#ped-scenario").val(shopData.ShopPed.scenario || "");
        }
        if (shopData.Blip) {
            $("#use-blip").prop("checked", true);
            $("#blip-settings").show();
            $("#blip-name").val(shopData.Blip.name || "");
            setBlipSprite(shopData.Blip.sprite || 52);
            setBlipColour(shopData.Blip.colour || 2);
            $("#blip-scale").val(shopData.Blip.scale || 0.7);
            $("#blip-shortrange").prop("checked", shopData.Blip.shortRange !== false);
        }
    }

    function addPositionEntry(x = "", y = "", z = "", heading, useHeading = false) {
        positionCounter++;
        const id = positionCounter;
        const headingChecked = useHeading ? "checked" : "";
        const headingDisplay = useHeading ? "flex" : "none";
        const headingVal = (heading !== undefined && heading !== null && heading !== "") ? parseFloat(heading).toFixed(2) : "";
        $("#positions-list").append(`
            <div class="position-entry" data-id="${id}">
                <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
                    <div style="flex:1;min-width:130px;"><label>X</label>
                        <input type="number" class="pos-x" placeholder="0.0000" value="${x}" step="0.0001"/></div>
                    <div style="flex:1;min-width:130px;"><label>Y</label>
                        <input type="number" class="pos-y" placeholder="0.0000" value="${y}" step="0.0001"/></div>
                    <div style="flex:1;min-width:130px;"><label>Z</label>
                        <input type="number" class="pos-z" placeholder="0.0000" value="${z}" step="0.0001"/></div>
                    <button class="btn-remove remove-position">Remove</button>
                </div>
                <div class="pos-heading-row" style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;">
                    <label class="checkbox-label" style="margin:0;">
                        <input type="checkbox" class="pos-use-heading" ${headingChecked}>
                        <span>Use Heading</span>
                    </label>
                    <div class="pos-heading-fields" style="display:${headingDisplay};align-items:center;gap:8px;flex:1;">
                        <input type="number" class="pos-heading" placeholder="0.00" value="${headingVal}" step="0.01" style="max-width:120px;"/>
                        <button type="button" class="btn-secondary btn-get-heading" style="padding:6px 10px;font-size:12px;" title="Use your current in-game heading">
                            <i class="fas fa-compass"></i> Current Heading
                        </button>
                    </div>
                </div>
            </div>
        `);
        // Scroll modal body so the new entry is visible
        const modalBody = document.querySelector(".modal-body");
        if (modalBody) {
            setTimeout(function() {
                const newEntry = modalBody.querySelector('.position-entry[data-id="' + id + '"]');
                if (newEntry) newEntry.scrollIntoView({behavior: "smooth", block: "nearest"});
            }, 60);
        }
    }

    function addItemEntry(label = "", item = "", price = "") {
        itemCounter++;
        $("#items-list").append(`
            <div class="item-entry" data-id="${itemCounter}">
                <div style="margin-bottom:12px;"><label>Item Display Name</label>
                    <input type="text" class="item-label" placeholder="e.g., Water Bottle" value="${label}"/></div>
                <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
                    <div style="flex:2;min-width:200px;"><label>Item Spawn Name</label>
                        <input type="text" class="item-name" placeholder="e.g., water" value="${item}" style="font-family:'Courier New',monospace;"/></div>
                    <div style="flex:1;min-width:120px;"><label>Price ($)</label>
                        <input type="number" class="item-price" placeholder="100" value="${price}"/></div>
                    <button class="btn-remove remove-item">Remove</button>
                </div>
            </div>
        `);
    }

    $("#add-position").on("click", function() { addPositionEntry(); });
    $("#add-current-position").on("click", function() {
        $.post("https://flake_shops/getCurrentPosition", JSON.stringify({}), function(pos) {
            if (pos && pos.x !== undefined) {
                addPositionEntry(pos.x, pos.y, pos.z, pos.heading, true);
                showNotification("Current position & heading added!", "success");
            }
        });
    });

    // Per-position heading toggle
    $("body").on("change", ".pos-use-heading", function() {
        const fields = $(this).closest(".pos-heading-row").find(".pos-heading-fields");
        $(this).is(":checked") ? fields.show() : fields.hide();
    });

    // Per-position "Current Heading" button
    $("body").on("click", ".btn-get-heading", function() {
        const entry = $(this).closest(".position-entry");
        $.post("https://flake_shops/getCurrentHeading", JSON.stringify({}), function(res) {
            if (res && res.heading !== undefined) {
                entry.find(".pos-heading").val(parseFloat(res.heading).toFixed(2));
                showNotification("Current heading applied!", "success");
            }
        });
    });
    $("#add-item").on("click", function() { addItemEntry(); });

    $("body").on("click", ".remove-position", function() { $(this).closest(".position-entry").remove(); });
    $("body").on("click", ".remove-item",     function() { $(this).closest(".item-entry").remove(); });

    $("#use-blip").on("change", function() {
        $(this).is(":checked") ? $("#blip-settings").slideDown() : $("#blip-settings").slideUp();
    });

    $("#add-custom-currency").on("click", function() {
        const val = $("#custom-currency").val().trim();
        if (val && !$(`.currency-check[value="${val}"]`).length) {
            $("#currency-list").append(`<label><input type="checkbox" class="currency-check" value="${val}" checked> ${val}</label>`);
            $("#custom-currency").val("");
            showNotification(`Added currency: ${val}`, "success");
        }
    });

    // ── Save / delete shop ────────────────────────────────────
    $("#save-shop").on("click", function() {
        const shopName = $("#shop-name").val().trim();
        if (!shopName) { showNotification("Please enter a shop name!", "error"); return; }

        const positions = [];
        $(".position-entry").each(function() {
            const x = parseFloat($(this).find(".pos-x").val()),
                  y = parseFloat($(this).find(".pos-y").val()),
                  z = parseFloat($(this).find(".pos-z").val());
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                const pos = {x, y, z};
                const useHeading = $(this).find(".pos-use-heading").is(":checked");
                if (useHeading) {
                    const h = parseFloat($(this).find(".pos-heading").val());
                    pos.heading = isNaN(h) ? 0.0 : h;
                    pos.useHeading = true;
                }
                positions.push(pos);
            }
        });
        if (!positions.length) { showNotification("Please add at least one position!", "error"); return; }

        const items = [];
        $(".item-entry").each(function() {
            const label = $(this).find(".item-label").val().trim(),
                  item  = $(this).find(".item-name").val().trim(),
                  price = parseFloat($(this).find(".item-price").val());
            if (label && item && !isNaN(price)) items.push({label, item, price});
        });
        if (!items.length) { showNotification("Please add at least one item!", "error"); return; }

        const currencies = [];
        $(".currency-check:checked").each(function() { currencies.push($(this).val()); });
        if (!currencies.length) { showNotification("Please select at least one currency!", "error"); return; }

        const shopData = {
            name: shopName, Items: items, Pos: positions, Currency: currencies,
            UsePickup: $("#use-pickup").is(":checked"),
            UsePed: $("#use-ped").is(":checked"),
            ShopLogo: $("#shop-logo").val().trim() || "blackmarket.png"
        };
        if (shopData.UsePed) {
            shopData.ShopPed = {
                model: $("#ped-model").val().trim() || "mp_m_shopkeep_01",
                scenario: $("#ped-scenario").val().trim() || "WORLD_HUMAN_STAND_IMPATIENT"
            };
        }
        if ($("#use-blip").is(":checked")) {
            shopData.Blip = {
                name: $("#blip-name").val().trim() || "Shop",
                sprite: parseInt($("#blip-sprite").val()) || 52,
                colour: parseInt($("#blip-colour").val()) || 2,
                scale: parseFloat($("#blip-scale").val()) || 0.7,
                display: 4,
                shortRange: $("#blip-shortrange").is(":checked")
            };
        }


        $.post("https://flake_shops/saveShop", JSON.stringify({ shopData, editMode }), function() {
            showNotification(`Shop "${shopName}" saved!`, "success");
            $("#shop-modal").fadeOut(200);
            $.post("https://flake_shops/requestShops", JSON.stringify({}), function(shops) {
                allShops = shops || [];
                renderShopsTable();
                updateDashboard();
            });
        });
    });

    $("#delete-shop").on("click", function() {
        const shopName = $("#shop-name").val().trim();
        showConfirm("Delete Shop", `Permanently delete "${shopName}"? This cannot be undone.`, function() {
            $.post("https://flake_shops/deleteShop", JSON.stringify({ shopName }), function() {
                showNotification(`Shop "${shopName}" deleted!`, "success");
                $("#shop-modal").fadeOut(200);
                $.post("https://flake_shops/requestShops", JSON.stringify({}), function(shops) {
                    allShops = shops || [];
                    renderShopsTable();
                    updateDashboard();
                });
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  ITEM SELECTOR  –  virtual scroll + grid + selection bar
    // ═══════════════════════════════════════════════════════════

    function escHtml(str) {
        return String(str)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;")
            .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function updateSelectorBar() {
        const n = vsSelected.size;
        $("#vs-selected-count").text(n);
        const btn = $("#vs-confirm-btn");
        if (n > 0) { btn.removeClass("disabled").prop("disabled", false); }
        else        { btn.addClass("disabled").prop("disabled", true); }
    }

    function updateTotalCount(n) {
        $("#vs-total-count").text(n.toLocaleString());
    }

    // Virtual grid painter
    function paintVirtualGrid(items, viewport, container) {
        const rows   = Math.ceil(items.length / VS_COLS);
        const totalH = rows * VS_ITEM_H;
        container.style.height   = totalH + "px";
        container.style.position = "relative";

        const scrollTop  = viewport.scrollTop;
        const viewH      = viewport.clientHeight;
        const firstRow   = Math.max(0, Math.floor(scrollTop / VS_ITEM_H) - VS_OVERSCAN);
        const lastRow    = Math.min(rows - 1, Math.ceil((scrollTop + viewH) / VS_ITEM_H) + VS_OVERSCAN);
        const firstIdx   = firstRow * VS_COLS;
        const lastIdx    = Math.min(items.length - 1, (lastRow + 1) * VS_COLS - 1);

        // Remove out-of-range cards
        container.querySelectorAll(".vs-card").forEach(card => {
            const idx = parseInt(card.dataset.idx, 10);
            if (idx < firstIdx || idx > lastIdx) card.remove();
        });

        const existing = new Set(
            [...container.querySelectorAll(".vs-card")].map(c => parseInt(c.dataset.idx, 10))
        );

        for (let i = firstIdx; i <= lastIdx; i++) {
            if (existing.has(i)) continue;
            const item = items[i];
            if (!item) continue;

            const col = i % VS_COLS;
            const row = Math.floor(i / VS_COLS);

            let imgSrc = "img/placeholder.svg";
            if (item.image) {
                if (item.image.startsWith("http://") || item.image.startsWith("https://")) {
                    imgSrc = item.image;
                } else {
                    imgSrc = item.imagePath || `nui://ox_inventory/web/images/${item.image}`;
                }
            }

            const isSel = vsSelected.has(item.name);
            const card  = document.createElement("div");
            card.className   = "vs-card" + (isSel ? " selected" : "");
            card.dataset.idx   = i;
            card.dataset.name  = item.name;
            card.dataset.label = item.label;
            card.style.cssText = `
                position: absolute;
                top: ${row * VS_ITEM_H + 4}px;
                left: calc(${col} / ${VS_COLS} * 100%);
                width: calc(100% / ${VS_COLS} - 8px);
                margin: 0 4px;
                box-sizing: border-box;
            `;
            card.innerHTML = `
                <div class="vs-check ${isSel ? "checked" : ""}">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1.5,6 4.5,9 10.5,3"/>
                    </svg>
                </div>
                <div class="vs-img-wrap">
                    <img src="${imgSrc}" loading="lazy"
                         onerror="this.src='img/placeholder.svg'" alt="${escHtml(item.label)}"/>
                </div>
                <div class="vs-info">
                    <div class="vs-label">${escHtml(item.label)}</div>
                    <div class="vs-name">${escHtml(item.name)}</div>
                </div>
            `;
            card.addEventListener("click", function () {
                const name = this.dataset.name;
                if (vsSelected.has(name)) {
                    vsSelected.delete(name);
                    this.classList.remove("selected");
                    this.querySelector(".vs-check").classList.remove("checked");
                } else {
                    vsSelected.add(name);
                    this.classList.add("selected");
                    this.querySelector(".vs-check").classList.add("checked");
                }
                updateSelectorBar();
            });
            container.appendChild(card);
        }
    }

    function renderVirtualGrid(items) {
        const viewport  = document.getElementById("vs-viewport");
        const container = document.getElementById("vs-grid-container");
        if (!viewport || !container) return;

        // Clear existing cards
        container.innerHTML = "";

        if (items.length === 0) {
            container.style.height = "120px";
            container.innerHTML = '<div style="color:#6b7280;text-align:center;padding:40px;font-size:14px;">No items found</div>';
            updateTotalCount(0);
            return;
        }

        const rows   = Math.ceil(items.length / VS_COLS);
        const totalH = rows * VS_ITEM_H;
        container.style.height = totalH + "px";

        let rafPending = false;
        function onScroll() {
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(function() {
                    paintVirtualGrid(items, viewport, container);
                    rafPending = false;
                });
            }
        }

        // Replace scroll listener
        viewport.onscroll = onScroll;
        viewport.scrollTop = 0;

        paintVirtualGrid(items, viewport, container);
        updateTotalCount(items.length);
        updateSelectorBar();
    }

    // Open item selector
    $("#add-item-from-list").on("click", function() {
        vsSelected = new Set();
        updateSelectorBar();
        $("#item-selector-loading").show();
        $("#vs-viewport").hide();
        $("#vs-selection-bar").hide();
        $("#item-search").val("");
        $("#item-selector-modal").fadeIn(200);

        $.post("https://flake_shops/requestItems", JSON.stringify({}), function(items) {
            serverItems = items.filter(i => i && i.name && i.label);
            vsItems = serverItems;

            $("#item-selector-loading").hide();
            $("#vs-viewport").show();
            $("#vs-selection-bar").show();

            renderVirtualGrid(vsItems);
        });
    });

    // Search
    let vsSearchTimeout;
    $("#item-search").on("input", function() {
        clearTimeout(vsSearchTimeout);
        const term = this.value.toLowerCase().trim();
        vsSearchTimeout = setTimeout(function() {
            vsItems = term
                ? serverItems.filter(i =>
                    i.name.toLowerCase().includes(term) ||
                    i.label.toLowerCase().includes(term))
                : serverItems;

            const vp = document.getElementById("vs-viewport");
            if (vp) vp.scrollTop = 0;
            renderVirtualGrid(vsItems);
        }, 150);
    });

    // Confirm add
    $(document).on("click", "#vs-confirm-btn", function() {
        if (vsSelected.size === 0) return;
        const itemMap = {};
        serverItems.forEach(i => { itemMap[i.name] = i; });
        vsSelected.forEach(name => {
            const item = itemMap[name];
            if (item) addItemEntry(item.label, item.name, 100);
        });
        showNotification(`Added ${vsSelected.size} item${vsSelected.size !== 1 ? "s" : ""} to shop!`, "success");
        $("#item-selector-modal").fadeOut(200);
        vsSelected = new Set();
        updateSelectorBar();
    });

    // Clear selection
    $(document).on("click", "#vs-clear-btn", function() {
        vsSelected = new Set();
        document.querySelectorAll(".vs-card.selected").forEach(c => {
            c.classList.remove("selected");
            const chk = c.querySelector(".vs-check");
            if (chk) chk.classList.remove("checked");
        });
        updateSelectorBar();
    });

    // Close
    $("#close-item-selector").on("click", function() { $("#item-selector-modal").fadeOut(200); });

    // ── Misc ──────────────────────────────────────────────────
    function closeAdmin() {
        $("#admin-wrapper").fadeOut();
        $.post("https://flake_shops/closeAdmin", JSON.stringify({}));
    }

    document.addEventListener("keyup", function(event) {
        if (event.which === 27) {
            if ($("#shop-modal").is(":visible"))          { $("#shop-modal").fadeOut(200); }
            else if ($("#item-selector-modal").is(":visible")) { $("#item-selector-modal").fadeOut(200); }
            else if ($("#admin-wrapper").is(":visible"))  { closeAdmin(); }
        }
    });

    $("#admin-wrapper").on("click", function(e) {
        if (e.target === this) closeAdmin();
    });

    // ══════════════════════════════════════════════════════════
    //  BLIP SPRITE & COLOR PICKERS
    // ══════════════════════════════════════════════════════════

    // Complete blip sprite map: id → radar_name (GTA5 build 3258)
    const BLIP_SPRITES = {
        0:'radar_higher',1:'radar_level',2:'radar_lower',3:'radar_police_ped',
        4:'radar_wanted_radius',5:'radar_area_blip',6:'radar_centre',7:'radar_north',
        8:'radar_waypoint',9:'radar_radius_blip',10:'radar_radius_outline_blip',
        11:'radar_weapon_higher',12:'radar_weapon_lower',13:'radar_higher_ai',
        14:'radar_lower_ai',15:'radar_police_heli_spin',16:'radar_police_plane_move',
        27:'radar_mp_crew',28:'radar_mp_friendlies',36:'radar_cable_car',
        37:'radar_activities',38:'radar_raceflag',40:'radar_safehouse',
        41:'radar_police',42:'radar_police_chase',43:'radar_police_heli',
        44:'radar_bomb_a',47:'radar_snitch',48:'radar_planning_locations',
        50:'radar_crim_carsteal',51:'radar_crim_drugs',52:'radar_crim_holdups',
        54:'radar_crim_player',56:'radar_cop_patrol',57:'radar_cop_player',
        58:'radar_crim_wanted',59:'radar_heist',60:'radar_police_station',
        61:'radar_hospital',62:'radar_assassins_mark',63:'radar_elevator',
        64:'radar_helicopter',66:'radar_random_character',67:'radar_security_van',
        68:'radar_tow_truck',70:'radar_illegal_parking',71:'radar_barber',
        72:'radar_car_mod_shop',73:'radar_clothes_store',75:'radar_tattoo',
        76:'radar_armenian_family',77:'radar_lester_family',78:'radar_michael_family',
        79:'radar_trevor_family',80:'radar_jewelry_heist',82:'radar_drag_race_finish',
        84:'radar_rampage',85:'radar_vinewood_tours',86:'radar_lamar_family',
        88:'radar_franklin_family',89:'radar_chinese_strand',90:'radar_flight_school',
        91:'radar_eye_sky',92:'radar_air_hockey',93:'radar_bar',94:'radar_base_jump',
        95:'radar_basketball',96:'radar_biolab_heist',99:'radar_cabaret_club',
        100:'radar_car_wash',102:'radar_comedy_club',103:'radar_darts',
        104:'radar_docks_heist',105:'radar_fbi_heist',106:'radar_fbi_officers_strand',
        107:'radar_finale_bank_heist',108:'radar_financier_strand',109:'radar_golf',
        110:'radar_gun_shop',111:'radar_internet_cafe',112:'radar_michael_family_exile',
        113:'radar_nice_house_heist',114:'radar_random_female',115:'radar_random_male',
        118:'radar_rural_bank_heist',119:'radar_shooting_range',120:'radar_solomon_strand',
        121:'radar_strip_club',122:'radar_tennis',123:'radar_trevor_family_exile',
        124:'radar_michael_trevor_family',126:'radar_triathlon',127:'radar_off_road_racing',
        128:'radar_gang_cops',129:'radar_gang_mexicans',130:'radar_gang_bikers',
        133:'radar_snitch_red',134:'radar_crim_cuff_keys',135:'radar_cinema',
        136:'radar_music_venue',137:'radar_police_station_blue',138:'radar_airport',
        139:'radar_crim_saved_vehicle',140:'radar_weed_stash',141:'radar_hunting',
        142:'radar_pool',143:'radar_objective_blue',144:'radar_objective_green',
        145:'radar_objective_red',146:'radar_objective_yellow',147:'radar_arms_dealing',
        148:'radar_mp_friend',149:'radar_celebrity_theft',
        150:'radar_weapon_assault_rifle',151:'radar_weapon_bat',
        152:'radar_weapon_grenade',153:'radar_weapon_health',154:'radar_weapon_knife',
        155:'radar_weapon_molotov',156:'radar_weapon_pistol',157:'radar_weapon_rocket',
        158:'radar_weapon_shotgun',159:'radar_weapon_smg',160:'radar_weapon_sniper',
        161:'radar_mp_noise',162:'radar_poi',163:'radar_passive',164:'radar_usingmenu',
        171:'radar_gang_cops_partner',173:'radar_weapon_minigun',175:'radar_weapon_armour',
        176:'radar_property_takeover',177:'radar_gang_mexicans_highlight',
        178:'radar_gang_bikers_highlight',179:'radar_triathlon_cycling',
        180:'radar_triathlon_swimming',181:'radar_property_takeover_bikers',
        182:'radar_property_takeover_cops',183:'radar_property_takeover_vagos',
        184:'radar_camera',185:'radar_centre_red',186:'radar_handcuff_keys_bikers',
        187:'radar_handcuff_keys_vagos',188:'radar_handcuffs_closed_bikers',
        189:'radar_handcuffs_closed_vagos',192:'radar_camera_badger',
        193:'radar_camera_facade',194:'radar_camera_ifruit',197:'radar_yoga',
        198:'radar_taxi',205:'radar_shrink',206:'radar_epsilon',
        207:'radar_financier_strand_grey',208:'radar_trevor_family_grey',
        209:'radar_trevor_family_red',210:'radar_franklin_family_grey',
        211:'radar_franklin_family_blue',212:'radar_franklin_a',213:'radar_franklin_b',
        214:'radar_franklin_c',225:'radar_gang_vehicle',226:'radar_gang_vehicle_bikers',
        227:'radar_gang_vehicle_cops',228:'radar_gang_vehicle_vagos',229:'radar_guncar',
        230:'radar_driving_bikers',231:'radar_driving_cops',232:'radar_driving_vagos',
        233:'radar_gang_cops_highlight',234:'radar_shield_bikers',235:'radar_shield_cops',
        236:'radar_shield_vagos',237:'radar_custody_bikers',238:'radar_custody_vagos',
        251:'radar_arms_dealing_air',252:'radar_playerstate_arrested',
        253:'radar_playerstate_custody',254:'radar_playerstate_driving',
        255:'radar_playerstate_keyholder',256:'radar_playerstate_partner',
        262:'radar_ztype',263:'radar_stinger',264:'radar_packer',265:'radar_monroe',
        266:'radar_fairground',267:'radar_property',268:'radar_gang_highlight',
        269:'radar_altruist',270:'radar_ai',271:'radar_on_mission',
        272:'radar_cash_pickup',273:'radar_chop',274:'radar_dead',
        275:'radar_territory_locked',276:'radar_cash_lost',277:'radar_cash_vagos',
        278:'radar_cash_cops',279:'radar_hooker',280:'radar_friend',
        281:'radar_mission_2to4',282:'radar_mission_2to8',283:'radar_mission_2to12',
        284:'radar_mission_2to16',285:'radar_custody_dropoff',286:'radar_onmission_cops',
        287:'radar_onmission_lost',288:'radar_onmission_vagos',
        289:'radar_crim_carsteal_cops',290:'radar_crim_carsteal_bikers',
        291:'radar_crim_carsteal_vagos',292:'radar_band_strand',293:'radar_simeon_family',
        294:'radar_mission_1',295:'radar_mission_2',296:'radar_friend_darts',
        297:'radar_friend_comedyclub',298:'radar_friend_cinema',299:'radar_friend_tennis',
        300:'radar_friend_stripclub',301:'radar_friend_livemusic',302:'radar_friend_golf',
        303:'radar_bounty_hit',304:'radar_ugc_mission',305:'radar_horde',
        306:'radar_cratedrop',307:'radar_plane_drop',308:'radar_sub',309:'radar_race',
        310:'radar_deathmatch',311:'radar_arm_wrestling',312:'radar_mission_1to2',
        313:'radar_shootingrange_gunshop',314:'radar_race_air',315:'radar_race_land',
        316:'radar_race_sea',317:'radar_tow',318:'radar_garbage',319:'radar_drill',
        320:'radar_spikes',321:'radar_firetruck',322:'radar_minigun2',323:'radar_bugstar',
        324:'radar_submarine',325:'radar_chinook',326:'radar_getaway_car',
        327:'radar_mission_bikers_1',328:'radar_mission_bikers_1to2',
        329:'radar_mission_bikers_2',330:'radar_mission_bikers_2to4',
        331:'radar_mission_bikers_2to8',332:'radar_mission_bikers_2to12',
        333:'radar_mission_bikers_2to16',334:'radar_mission_cops_1',
        335:'radar_mission_cops_1to2',336:'radar_mission_cops_2',
        337:'radar_mission_cops_2to4',338:'radar_mission_cops_2to8',
        339:'radar_mission_cops_2to12',340:'radar_mission_cops_2to16',
        341:'radar_mission_vagos_1',342:'radar_mission_vagos_1to2',
        343:'radar_mission_vagos_2',344:'radar_mission_vagos_2to4',
        345:'radar_mission_vagos_2to8',346:'radar_mission_vagos_2to12',
        347:'radar_mission_vagos_2to16',348:'radar_gang_bike',349:'radar_gas_grenade',
        350:'radar_property_for_sale',351:'radar_gang_attack_package',
        352:'radar_martin_madrazzo',353:'radar_enemy_heli_spin',354:'radar_boost',
        355:'radar_devin',356:'radar_dock',357:'radar_garage',358:'radar_golf_flag',
        359:'radar_hangar',360:'radar_helipad',361:'radar_jerry_can',362:'radar_mask',
        363:'radar_heist_prep',364:'radar_incapacitated',365:'radar_spawn_point_pickup',
        366:'radar_boilersuit',367:'radar_completed',368:'radar_rockets',
        369:'radar_garage_for_sale',370:'radar_helipad_for_sale',371:'radar_dock_for_sale',
        372:'radar_hangar_for_sale',373:'radar_placeholder_6',374:'radar_business',
        375:'radar_business_for_sale',376:'radar_race_bike',377:'radar_parachute',
        378:'radar_team_deathmatch',379:'radar_race_foot',380:'radar_vehicle_deathmatch',
        381:'radar_barry',382:'radar_dom',383:'radar_maryann',384:'radar_cletus',
        385:'radar_josh',386:'radar_minute',387:'radar_omega',388:'radar_tonya',
        389:'radar_paparazzo',390:'radar_aim',391:'radar_cratedrop_background',
        392:'radar_green_and_net_player1',393:'radar_green_and_net_player2',
        394:'radar_green_and_net_player3',395:'radar_green_and_friendly',
        396:'radar_net_player1_and_net_player2',397:'radar_net_player1_and_net_player3',
        398:'radar_creator',399:'radar_creator_direction',400:'radar_abigail',
        401:'radar_blimp',402:'radar_repair',403:'radar_testosterone',404:'radar_dinghy',
        405:'radar_fanatic',407:'radar_info_icon',408:'radar_capture_the_flag',
        409:'radar_last_team_standing',410:'radar_boat',
        411:'radar_capture_the_flag_base',412:'radar_mp_crew',
        413:'radar_capture_the_flag_outline',414:'radar_capture_the_flag_base_nobag',
        415:'radar_weapon_jerrycan',416:'radar_rp',417:'radar_level_inside',
        418:'radar_bounty_hit_inside',419:'radar_capture_the_usaflag',
        420:'radar_capture_the_usaflag_outline',421:'radar_tank',
        422:'radar_player_heli',423:'radar_player_plane',424:'radar_player_jet',
        425:'radar_centre_stroke',426:'radar_player_guncar',427:'radar_player_boat',
        428:'radar_mp_heist',429:'radar_temp_1',430:'radar_temp_2',431:'radar_temp_3',
        432:'radar_temp_4',433:'radar_temp_5',434:'radar_temp_6',435:'radar_race_stunt',
        436:'radar_hot_property',437:'radar_urbanwarfare_versus',
        438:'radar_king_of_the_castle',439:'radar_player_king',440:'radar_dead_drop',
        441:'radar_penned_in',442:'radar_beast',443:'radar_edge_pointer',
        444:'radar_edge_crosstheline',445:'radar_mp_lamar',446:'radar_bennys',
        447:'radar_corner_number_1',448:'radar_corner_number_2',449:'radar_corner_number_3',
        450:'radar_corner_number_4',451:'radar_corner_number_5',452:'radar_corner_number_6',
        453:'radar_corner_number_7',454:'radar_corner_number_8',455:'radar_yacht',
        456:'radar_finders_keepers',457:'radar_assault_package',458:'radar_hunt_the_boss',
        459:'radar_sightseer',460:'radar_turreted_limo',461:'radar_belly_of_the_beast',
        462:'radar_yacht_location',463:'radar_pickup_beast',464:'radar_pickup_zoned',
        465:'radar_pickup_random',466:'radar_pickup_slow_time',467:'radar_pickup_swap',
        468:'radar_pickup_thermal',469:'radar_pickup_weed',470:'radar_weapon_railgun',
        471:'radar_seashark',472:'radar_pickup_hidden',473:'radar_warehouse',
        474:'radar_warehouse_for_sale',475:'radar_office',476:'radar_office_for_sale',
        477:'radar_truck',478:'radar_contraband',479:'radar_trailer',480:'radar_vip',
        481:'radar_cargobob',482:'radar_area_outline_blip',483:'radar_pickup_accelerator',
        484:'radar_pickup_ghost',485:'radar_pickup_detonator',486:'radar_pickup_bomb',
        487:'radar_pickup_armoured',488:'radar_stunt',489:'radar_weapon_lives',
        490:'radar_stunt_premium',491:'radar_adversary',492:'radar_biker_clubhouse',
        493:'radar_biker_caged_in',494:'radar_biker_turf_war',495:'radar_biker_joust',
        496:'radar_production_weed',497:'radar_production_crack',
        498:'radar_production_fake_id',499:'radar_production_meth',
        500:'radar_production_money',501:'radar_package',502:'radar_capture_1',
        503:'radar_capture_2',504:'radar_capture_3',505:'radar_capture_4',
        506:'radar_capture_5',507:'radar_capture_6',508:'radar_capture_7',
        509:'radar_capture_8',510:'radar_capture_9',511:'radar_capture_10',
        512:'radar_quad',513:'radar_bus',514:'radar_drugs_package',
        515:'radar_pickup_jump',516:'radar_adversary_4',517:'radar_adversary_8',
        518:'radar_adversary_10',519:'radar_adversary_12',520:'radar_adversary_16',
        521:'radar_laptop',522:'radar_pickup_deadline',523:'radar_sports_car',
        524:'radar_warehouse_vehicle',525:'radar_reg_papers',
        526:'radar_police_station_dropoff',527:'radar_junkyard',528:'radar_ex_vech_1',
        529:'radar_ex_vech_2',530:'radar_ex_vech_3',531:'radar_ex_vech_4',
        532:'radar_ex_vech_5',533:'radar_ex_vech_6',534:'radar_ex_vech_7',
        535:'radar_target_a',536:'radar_target_b',537:'radar_target_c',538:'radar_target_d',
        539:'radar_target_e',540:'radar_target_f',541:'radar_target_g',542:'radar_target_h',
        543:'radar_jugg',544:'radar_pickup_repair',545:'radar_steeringwheel',
        546:'radar_trophy',547:'radar_pickup_rocket_boost',548:'radar_pickup_homing_rocket',
        549:'radar_pickup_machinegun',550:'radar_pickup_parachute',
        551:'radar_pickup_time_5',552:'radar_pickup_time_10',553:'radar_pickup_time_15',
        554:'radar_pickup_time_20',555:'radar_pickup_time_30',556:'radar_supplies',
        557:'radar_property_bunker',558:'radar_gr_wvm_1',559:'radar_gr_wvm_2',
        560:'radar_gr_wvm_3',561:'radar_gr_wvm_4',562:'radar_gr_wvm_5',
        563:'radar_gr_wvm_6',564:'radar_gr_covert_ops',565:'radar_adversary_bunker',
        566:'radar_gr_moc_upgrade',567:'radar_gr_w_upgrade',568:'radar_sm_cargo',
        569:'radar_sm_hangar',570:'radar_tf_checkpoint',571:'radar_race_tf',
        572:'radar_sm_wp1',573:'radar_sm_wp2',574:'radar_sm_wp3',575:'radar_sm_wp4',
        576:'radar_sm_wp5',577:'radar_sm_wp6',578:'radar_sm_wp7',579:'radar_sm_wp8',
        580:'radar_sm_wp9',581:'radar_sm_wp10',582:'radar_sm_wp11',583:'radar_sm_wp12',
        584:'radar_sm_wp13',585:'radar_sm_wp14',586:'radar_nhp_bag',587:'radar_nhp_chest',
        588:'radar_nhp_orbit',589:'radar_nhp_veh1',590:'radar_nhp_base',
        591:'radar_nhp_overlay',592:'radar_nhp_turret',593:'radar_nhp_mg_firewall',
        594:'radar_nhp_mg_node',595:'radar_nhp_wp1',596:'radar_nhp_wp2',
        597:'radar_nhp_wp3',598:'radar_nhp_wp4',599:'radar_nhp_wp5',600:'radar_nhp_wp6',
        601:'radar_nhp_wp7',602:'radar_nhp_wp8',603:'radar_nhp_wp9',604:'radar_nhp_cctv',
        605:'radar_nhp_starterpack',606:'radar_nhp_turret_console',
        607:'radar_nhp_mg_mir_rotate',608:'radar_nhp_mg_mir_static',
        609:'radar_nhp_mg_proxy',610:'radar_acsr_race_target',611:'radar_acsr_race_hotring',
        612:'radar_acsr_wp1',613:'radar_acsr_wp2',614:'radar_bat_club_property',
        615:'radar_bat_cargo',616:'radar_bat_truck',617:'radar_bat_hack_jewel',
        618:'radar_bat_hack_gold',619:'radar_bat_keypad',620:'radar_bat_hack_target',
        621:'radar_pickup_dtb_health',622:'radar_pickup_dtb_blast_increase',
        623:'radar_pickup_dtb_blast_decrease',624:'radar_pickup_dtb_bomb_increase',
        625:'radar_pickup_dtb_bomb_decrease',626:'radar_bat_rival_club',
        627:'radar_bat_drone',628:'radar_bat_cash_reg',629:'radar_cctv',
        630:'radar_bat_assassinate',631:'radar_bat_pbus',632:'radar_bat_wp1',
        633:'radar_bat_wp2',634:'radar_bat_wp3',635:'radar_bat_wp4',636:'radar_bat_wp5',
        637:'radar_bat_wp6',638:'radar_blimp_2',639:'radar_oppressor_2',
        640:'radar_bat_wp7',641:'radar_arena_series',642:'radar_arena_premium',
        643:'radar_arena_workshop',644:'radar_race_wars',645:'radar_arena_turret',
        646:'radar_arena_rc_car',647:'radar_arena_rc_workshop',648:'radar_arena_trap_fire',
        649:'radar_arena_trap_flip',650:'radar_arena_trap_sea',651:'radar_arena_trap_turn',
        652:'radar_arena_trap_pit',653:'radar_arena_trap_mine',654:'radar_arena_trap_bomb',
        655:'radar_arena_trap_wall',656:'radar_arena_trap_brd',657:'radar_arena_trap_sbrd',
        658:'radar_arena_bruiser',659:'radar_arena_brutus',660:'radar_arena_cerberus',
        661:'radar_arena_deathbike',662:'radar_arena_dominator',663:'radar_arena_impaler',
        664:'radar_arena_imperator',665:'radar_arena_issi',666:'radar_arena_sasquatch',
        667:'radar_arena_scarab',668:'radar_arena_slamvan',669:'radar_arena_zr380',
        670:'radar_ap',671:'radar_comic_store',672:'radar_cop_car',
        673:'radar_rc_time_trials',674:'radar_king_of_the_hill',
        675:'radar_king_of_the_hill_teams',676:'radar_rucksack',
        677:'radar_shipping_container',678:'radar_agatha',679:'radar_casino',
        680:'radar_casino_table_games',681:'radar_casino_wheel',
        682:'radar_casino_concierge',683:'radar_casino_chips',
        684:'radar_casino_horse_racing',685:'radar_adversary_featured',
        686:'radar_roulette_1',687:'radar_roulette_2',688:'radar_roulette_3',
        689:'radar_roulette_4',690:'radar_roulette_5',691:'radar_roulette_6',
        692:'radar_roulette_7',693:'radar_roulette_8',694:'radar_roulette_9',
        695:'radar_roulette_10',696:'radar_roulette_11',697:'radar_roulette_12',
        698:'radar_roulette_13',699:'radar_roulette_14',700:'radar_roulette_15',
        701:'radar_roulette_16',702:'radar_roulette_17',703:'radar_roulette_18',
        704:'radar_roulette_19',705:'radar_roulette_20',706:'radar_roulette_21',
        707:'radar_roulette_22',708:'radar_roulette_23',709:'radar_roulette_24',
        710:'radar_roulette_25',711:'radar_roulette_26',712:'radar_roulette_27',
        713:'radar_roulette_28',714:'radar_roulette_29',715:'radar_roulette_30',
        716:'radar_roulette_31',717:'radar_roulette_32',718:'radar_roulette_33',
        719:'radar_roulette_34',720:'radar_roulette_35',721:'radar_roulette_36',
        722:'radar_roulette_0',723:'radar_roulette_00',724:'radar_limo',
        725:'radar_weapon_alien',726:'radar_race_open_wheel',727:'radar_rappel',
        728:'radar_swap_car',729:'radar_scuba_gear',730:'radar_cpanel_1',
        731:'radar_cpanel_2',732:'radar_cpanel_3',733:'radar_cpanel_4',
        734:'radar_snow_truck',735:'radar_buggy_1',736:'radar_buggy_2',737:'radar_zhaba',
        738:'radar_gerald',739:'radar_ron',740:'radar_arcade',741:'radar_drone_controls',
        742:'radar_rc_tank',743:'radar_stairs',744:'radar_camera_2',745:'radar_winky',
        746:'radar_mini_sub',747:'radar_kart_retro',748:'radar_kart_modern',
        749:'radar_military_quad',750:'radar_military_truck',751:'radar_ship_wheel',
        752:'radar_ufo',753:'radar_seasparrow2',754:'radar_dinghy2',
        755:'radar_patrol_boat',756:'radar_retro_sports_car',757:'radar_squadee',
        758:'radar_folding_wing_jet',759:'radar_valkyrie2',760:'radar_sub2',
        761:'radar_bolt_cutters',762:'radar_rappel_gear',763:'radar_keycard',
        764:'radar_password',765:'radar_island_heist_prep',766:'radar_island_party',
        767:'radar_control_tower',768:'radar_underwater_gate',769:'radar_power_switch',
        770:'radar_compound_gate',771:'radar_rappel_point',772:'radar_keypad',
        773:'radar_sub_controls',774:'radar_sub_periscope',775:'radar_sub_missile',
        776:'radar_painting',777:'radar_car_meet',778:'radar_car_test_area',
        779:'radar_auto_shop_property',780:'radar_docks_export',781:'radar_prize_car',
        782:'radar_test_car',783:'radar_car_robbery_board',784:'radar_car_robbery_prep',
        785:'radar_street_race_series',786:'radar_pursuit_series',
        787:'radar_car_meet_organiser',788:'radar_securoserv',
        789:'radar_bounty_collectibles',790:'radar_movie_collectibles',
        791:'radar_trailer_ramp',792:'radar_race_organiser',793:'radar_chalkboard_list',
        794:'radar_export_vehicle',795:'radar_train',796:'radar_heist_diamond',
        797:'radar_heist_doomsday',798:'radar_heist_island',799:'radar_slamvan2',
        800:'radar_crusader',801:'radar_construction_outfit',802:'radar_overlay_jammed',
        803:'radar_heist_island_unavailable',804:'radar_heist_diamond_unavailable',
        805:'radar_heist_doomsday_unavailable',806:'radar_placeholder_7',
        807:'radar_placeholder_8',808:'radar_placeholder_9',809:'radar_featured_series',
        810:'radar_vehicle_for_sale',811:'radar_van_keys',812:'radar_suv_service',
        813:'radar_security_contract',814:'radar_safe',815:'radar_ped_r',
        816:'radar_ped_e',817:'radar_payphone',818:'radar_patriot3',
        819:'radar_music_studio',820:'radar_jubilee',821:'radar_granger2',
        822:'radar_explosive_charge',823:'radar_deity',824:'radar_d_champion',
        825:'radar_buffalo4',826:'radar_agency',827:'radar_biker_bar',
        828:'radar_simeon_overlay',829:'radar_junk_skydive',
        830:'radar_luxury_car_showroom',831:'radar_car_showroom',
        832:'radar_car_showroom_simeon',833:'radar_flaming_skull',
        834:'radar_weapon_ammo',835:'radar_community_series',836:'radar_cayo_series',
        837:'radar_clubhouse_contract',838:'radar_agent_ulp',839:'radar_acid',
        840:'radar_acid_lab',841:'radar_dax_overlay',842:'radar_dead_drop_package',
        843:'radar_downtown_cab',844:'radar_gun_van',845:'radar_stash_house',
        846:'radar_tractor',847:'radar_warehouse_juggalo',
        848:'radar_warehouse_juggalo_dax',849:'radar_weapon_crowbar',
        850:'radar_duffel_bag',851:'radar_oil_tanker',852:'radar_acid_lab_tent',
        853:'radar_van_burrito',854:'radar_acid_boost',855:'radar_ped_gang_leader',
        856:'radar_multistorey_garage',857:'radar_seized_asset_sales',
        858:'radar_cayo_attrition',859:'radar_bicycle',860:'radar_bicycle_trial',
        861:'radar_raiju',862:'radar_conada2',863:'radar_overlay_ready_for_sell',
        864:'radar_overlay_missing_supplies',865:'radar_streamer216',
        866:'radar_signal_jammer',867:'radar_salvage_yard',
        868:'radar_robbery_prep_equipment',869:'radar_robbery_prep_overlay',
        870:'radar_yusuf',871:'radar_vincent',872:'radar_vinewood_garage',
        873:'radar_lstb',874:'radar_cctv_workstation',875:'radar_hacking_device',
        876:'radar_race_drag',877:'radar_race_drift',878:'radar_casino_prep',
        879:'radar_planning_wall',880:'radar_weapon_crate',881:'radar_weapon_snowball',
        882:'radar_train_signals_green',883:'radar_train_signals_red',
        884:'radar_office_transporter',885:'radar_yankton_survival',
        886:'radar_daily_bounty',887:'radar_bounty_target',888:'radar_filming_schedule',
        889:'radar_pizza_this',890:'radar_aircraft_carrier',891:'radar_weapon_emp',
        892:'radar_maude_eccles',893:'radar_bail_bonds_office',
        894:'radar_weapon_emp_mine',895:'radar_zombie_disease',
        896:'radar_zombie_proximity',897:'radar_zombie_fire',898:'radar_animal_possessed',
        899:'radar_mobile_phone',900:'radar_garment_factory',
        901:'radar_garment_factory_for_sale',902:'radar_garment_factory_equipment',
        903:'radar_field_hangar',904:'radar_field_hangar_for_sale',
        905:'radar_cargobob_ch53',906:'radar_chopper_lift_ammo',
        907:'radar_chopper_lift_armor',908:'radar_chopper_lift_explosives',
        909:'radar_chopper_lift_upgrade',910:'radar_chopper_lift_weapon',
        911:'radar_cargo_ship',912:'radar_submarine_missile',
        913:'radar_propeller_engine',914:'radar_shark',915:'radar_fast_travel',
        916:'radar_plane_duster2',917:'radar_plane_titan2',918:'radar_collectible',
        919:'radar_field_hangar_discount',920:'radar_garment_factory_discount',
        921:'radar_weapon_gusenberg_sweeper',922:'radar_weapon_tear_gas',
        923:'radar_dog',924:'radar_bobcat_security',925:'radar_smoke_shop',
        926:'radar_smoke_shop_for_sale',927:'radar_smoke_shop_attention',
        928:'radar_helitours',929:'radar_helitours_for_sale',
        930:'radar_helitours_attention',931:'radar_car_wash_business',
        932:'radar_car_wash_business_for_sale',933:'radar_car_wash_business_attention',
        934:'radar_attention',935:'radar_alarm',936:'radar_helitours_discount',
        937:'radar_smoke_shop_discount',938:'radar_car_wash_business_discount',
        939:'radar_real_estate',940:'radar_medical_courier',941:'radar_gruppe_sechs',
        942:'radar_fire_station',943:'radar_fire_truck',944:'radar_alpha_mail',
        945:'radar_ls_meteor',946:'radar_four20_survival',
        947:'radar_community_mission_series',948:'radar_property_mansion',
        949:'radar_ai_keypad',950:'radar_taxi_self_drive',951:'radar_train_subway',
        952:'radar_trashbag',953:'radar_mission_creator',954:'radar_cat',
        955:'radar_mansion_ai_m',956:'radar_mansion_ai_f',957:'radar_mansion_ai_gang',
    };

    // Blip colors from FiveM docs with accurate hex values
    const BLIP_COLORS = [
        {id:0,hex:'#FFFFFF',name:'White'},
        {id:1,hex:'#FF0000',name:'Red'},
        {id:2,hex:'#00B94A',name:'Green'},
        {id:3,hex:'#1469C9',name:'Blue'},
        {id:4,hex:'#FFFFFF',name:'White'},
        {id:5,hex:'#FFD700',name:'Yellow'},
        {id:6,hex:'#FF6B6B',name:'Light Red'},
        {id:7,hex:'#9B59B6',name:'Violet'},
        {id:8,hex:'#FF80C0',name:'Pink'},
        {id:9,hex:'#FFA07A',name:'Light Orange'},
        {id:10,hex:'#C4A35A',name:'Light Brown'},
        {id:11,hex:'#90EE90',name:'Light Green'},
        {id:12,hex:'#87CEEB',name:'Light Blue'},
        {id:13,hex:'#DDA0DD',name:'Light Purple'},
        {id:14,hex:'#4B0082',name:'Dark Purple'},
        {id:15,hex:'#00FFFF',name:'Cyan'},
        {id:16,hex:'#FFFFE0',name:'Light Yellow'},
        {id:17,hex:'#FFA500',name:'Orange'},
        {id:18,hex:'#ADD8E6',name:'Light Blue'},
        {id:19,hex:'#C71585',name:'Dark Pink'},
        {id:20,hex:'#B8860B',name:'Dark Yellow'},
        {id:21,hex:'#FF8C00',name:'Dark Orange'},
        {id:22,hex:'#D3D3D3',name:'Light Gray'},
        {id:23,hex:'#FFB6C1',name:'Light Pink'},
        {id:24,hex:'#7CFC00',name:'Lemon Green'},
        {id:25,hex:'#228B22',name:'Forest Green'},
        {id:26,hex:'#7DF9FF',name:'Electric Blue'},
        {id:27,hex:'#BF5FFF',name:'Bright Purple'},
        {id:28,hex:'#DAA520',name:'Dark Yellow'},
        {id:29,hex:'#00008B',name:'Dark Blue'},
        {id:30,hex:'#008B8B',name:'Dark Cyan'},
        {id:31,hex:'#D2B48C',name:'Light Brown'},
        {id:32,hex:'#B0C4DE',name:'Light Blue'},
        {id:33,hex:'#FAFAD2',name:'Light Yellow'},
        {id:34,hex:'#FFB6C1',name:'Light Pink'},
        {id:35,hex:'#FF6347',name:'Light Red'},
        {id:36,hex:'#F5F5DC',name:'Beige'},
        {id:37,hex:'#FFFFFF',name:'White'},
        {id:38,hex:'#4169E1',name:'Blue'},
        {id:39,hex:'#C0C0C0',name:'Light Gray'},
        {id:40,hex:'#696969',name:'Dark Gray'},
        {id:41,hex:'#FF1493',name:'Pink Red'},
        {id:42,hex:'#0000FF',name:'Blue'},
        {id:43,hex:'#98FB98',name:'Light Green'},
        {id:44,hex:'#FFDAB9',name:'Light Orange'},
        {id:45,hex:'#FFFFFF',name:'White'},
        {id:46,hex:'#FFD700',name:'Gold'},
        {id:47,hex:'#FF7F00',name:'Orange'},
        {id:48,hex:'#FF55A3',name:'Brilliant Rose'},
        {id:49,hex:'#DC143C',name:'Red'},
        {id:50,hex:'#9370DB',name:'Medium Purple'},
        {id:51,hex:'#FA8072',name:'Salmon'},
        {id:52,hex:'#006400',name:'Dark Green'},
        {id:53,hex:'#A5F2F3',name:'Blizzard Blue'},
        {id:54,hex:'#3A5FCD',name:'Oracle Blue'},
        {id:55,hex:'#C0C0C0',name:'Silver'},
        {id:56,hex:'#A52A2A',name:'Brown'},
        {id:57,hex:'#4169E1',name:'Blue'},
        {id:58,hex:'#474787',name:'East Bay'},
        {id:59,hex:'#FF0000',name:'Red'},
        {id:60,hex:'#FFAE42',name:'Yellow Orange'},
        {id:61,hex:'#C54B8C',name:'Mulberry Pink'},
        {id:62,hex:'#DBDBDB',name:'Alto Gray'},
        {id:63,hex:'#5B8DB8',name:'Jelly Bean Blue'},
        {id:64,hex:'#FF8C00',name:'Dark Orange'},
        {id:65,hex:'#8B008B',name:'Mamba'},
        {id:66,hex:'#FFAE42',name:'Yellow Orange'},
        {id:67,hex:'#0000FF',name:'Blue'},
        {id:68,hex:'#0000FF',name:'Blue'},
        {id:69,hex:'#008000',name:'Green'},
        {id:70,hex:'#FFAE42',name:'Yellow Orange'},
        {id:71,hex:'#FFAE42',name:'Yellow Orange'},
        {id:72,hex:'#333333',name:'Transparent Black'},
        {id:73,hex:'#FFAE42',name:'Yellow Orange'},
        {id:74,hex:'#0000FF',name:'Blue'},
        {id:75,hex:'#FF0000',name:'Red'},
        {id:76,hex:'#8B0000',name:'Deep Red'},
        {id:77,hex:'#0000FF',name:'Blue'},
        {id:78,hex:'#3A5FCD',name:'Oracle Blue'},
        {id:79,hex:'#CC0000',name:'Transparent Red'},
        {id:80,hex:'#0000CC',name:'Transparent Blue'},
        {id:81,hex:'#FFA500',name:'Orange'},
        {id:82,hex:'#90EE90',name:'Light Green'},
        {id:83,hex:'#800080',name:'Purple'},
        {id:84,hex:'#0000FF',name:'Blue'},
        {id:85,hex:'#333333',name:'Transparent Black'},
    ];

    function getSpriteLabel(radarName) {
        return radarName.replace(/^radar_/, '').replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function getSpriteImgUrl(radarName) {
        return `https://docs.fivem.net/blips/${radarName}.png`;
    }

    function setBlipSprite(id) {
        id = parseInt(id) || 52;
        $("#blip-sprite").val(id);
        const radarName = BLIP_SPRITES[id];
        const imgEl = document.getElementById("blip-sprite-img");
        const labelEl = document.getElementById("blip-sprite-id-label");
        if (!imgEl || !labelEl) return;
        labelEl.textContent = id;
        if (radarName) {
            imgEl.src = getSpriteImgUrl(radarName);
            imgEl.style.display = "";
            labelEl.style.display = "none";
            imgEl.onerror = function() {
                this.style.display = "none";
                labelEl.style.display = "flex";
            };
        } else {
            imgEl.style.display = "none";
            labelEl.style.display = "flex";
        }
    }

    function setBlipColour(id) {
        id = parseInt(id) || 2;
        $("#blip-colour").val(id);
        const colorData = BLIP_COLORS.find(c => c.id === id);
        const hex = colorData ? colorData.hex : "#CCCCCC";
        const name = colorData ? colorData.name : `Color ${id}`;
        $("#blip-colour-swatch").css("background", hex);
        $("#blip-colour-label").text(`${name} (${id})`);
        $("#blip-colour-grid .blip-colour-cell").removeClass("selected");
        $(`#blip-colour-grid .blip-colour-cell[data-id="${id}"]`).addClass("selected");
    }

    function buildColorGrid() {
        const grid = $("#blip-colour-grid");
        grid.empty();
        BLIP_COLORS.forEach(c => {
            grid.append(
                `<div class="blip-colour-cell" data-id="${c.id}" title="${c.name} (${c.id})"
                      style="background:${c.hex};"></div>`
            );
        });
        setBlipColour(parseInt($("#blip-colour").val()) || 2);
    }

    $("body").on("click", ".blip-colour-cell", function() {
        setBlipColour(parseInt($(this).attr("data-id")));
    });

    // Sprite picker
    let allBlipSprites = [];
    let filteredBlipSprites = [];

    function buildSpriteList() {
        allBlipSprites = Object.entries(BLIP_SPRITES)
            .map(([id, rn]) => ({id: parseInt(id), name: getSpriteLabel(rn), radarName: rn}))
            .sort((a, b) => a.id - b.id);
        filteredBlipSprites = allBlipSprites.slice();
    }

    let _spriteObserver = null;

    function renderSpriteGrid(items) {
        const grid = document.getElementById("blip-sprite-grid");
        if (!grid) return;

        // Disconnect previous observer
        if (_spriteObserver) { _spriteObserver.disconnect(); _spriteObserver = null; }

        grid.innerHTML = "";
        $("#blip-sprite-count").text(items.length);
        const currentId = parseInt($("#blip-sprite").val()) || 52;

        // IntersectionObserver: load images only when they enter the viewport
        if (window.IntersectionObserver) {
            _spriteObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            delete img.dataset.src;
                            _spriteObserver.unobserve(img);
                        }
                    }
                });
            }, { root: grid, rootMargin: "300px", threshold: 0 });
        }

        items.forEach(function(s) {
            const card = document.createElement("div");
            card.className = "blip-sprite-card" + (s.id === currentId ? " selected" : "");
            card.dataset.id = s.id;
            card.title = s.name + " (" + s.id + ")";

            const imgWrap = document.createElement("div");
            imgWrap.className = "blip-sprite-card-img";

            const img = document.createElement("img");
            img.alt = s.name;
            img.width = 42; img.height = 42;
            const imgUrl = getSpriteImgUrl(s.radarName);
            if (_spriteObserver) {
                img.dataset.src = imgUrl; // lazy: loaded by observer
            } else {
                img.src = imgUrl; // fallback: no observer support
            }
            img.onerror = function() {
                this.style.display = "none";
                const fb = this.nextElementSibling;
                if (fb) fb.style.display = "flex";
            };

            const fallback = document.createElement("span");
            fallback.className = "blip-sprite-card-fallback";
            fallback.style.display = "none";
            fallback.textContent = s.id;

            imgWrap.appendChild(img);
            imgWrap.appendChild(fallback);

            const labelEl = document.createElement("div");
            labelEl.className = "blip-sprite-card-label";
            labelEl.textContent = s.name;

            const idEl = document.createElement("div");
            idEl.className = "blip-sprite-card-id";
            idEl.textContent = s.id;

            card.appendChild(imgWrap);
            card.appendChild(labelEl);
            card.appendChild(idEl);

            card.addEventListener("click", function() {
                setBlipSprite(s.id);
                $("#blip-sprite-modal").fadeOut(150);
                showNotification("Sprite " + s.id + " — " + s.name + " selected", "success");
            });

            grid.appendChild(card);
            if (_spriteObserver) _spriteObserver.observe(img);
        });
    }

    $("#open-sprite-picker").on("click", function() {
        if (!allBlipSprites.length) buildSpriteList();
        filteredBlipSprites = allBlipSprites.slice();
        $("#blip-sprite-search").val("");
        renderSpriteGrid(filteredBlipSprites);
        $("#blip-sprite-modal").fadeIn(150);
    });

    $("#close-sprite-picker").on("click", function() {
        $("#blip-sprite-modal").fadeOut(150);
    });

    let spriteSearchTimeout;
    $("#blip-sprite-search").on("input", function() {
        clearTimeout(spriteSearchTimeout);
        const term = this.value.toLowerCase().trim();
        spriteSearchTimeout = setTimeout(function() {
            filteredBlipSprites = term
                ? allBlipSprites.filter(s =>
                    s.name.toLowerCase().includes(term) ||
                    s.radarName.toLowerCase().includes(term) ||
                    String(s.id).includes(term))
                : allBlipSprites.slice();
            renderSpriteGrid(filteredBlipSprites);
        }, 150);
    });

    // Init color grid and default sprite preview
    buildColorGrid();
    setBlipSprite(52);

    // ── Dashboard analytics cards (all shops overview) ────────
    function formatAnalyticsDate(val) {
        if (!val) return 'N/A';
        const ms = typeof val === 'number' ? val : parseInt(val, 10);
        const d = isNaN(ms) ? new Date(val) : new Date(ms);
        if (isNaN(d.getTime())) return String(val);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function updateAnalyticsDisplay(analytics) {
        if (!analytics || !Array.isArray(analytics)) return;

        let totalRevenue = 0, totalTransactions = 0, totalCustomers = 0;
        analytics.forEach(function(row) {
            totalRevenue      += parseFloat(row.total_revenue)      || 0;
            totalTransactions += parseFloat(row.total_transactions) || 0;
            totalCustomers    += parseFloat(row.unique_customers)   || 0;
        });

        if ($("#total-revenue").length)      $("#total-revenue").text("$" + totalRevenue.toLocaleString());
        if ($("#total-transactions").length) $("#total-transactions").text(totalTransactions.toLocaleString());
        if ($("#total-customers").length)    $("#total-customers").text(totalCustomers.toLocaleString());

        const container = $("#shop-analytics-container");
        if (!container.length) return;
        container.empty();
        if (!analytics.length) {
            container.html('<div class="no-data">No analytics data yet. Data is collected when players make purchases.</div>');
            return;
        }
        const grid = $('<div class="shop-analytics-grid"></div>');
        analytics.forEach(function(row) {
            grid.append(`
                <div class="shop-analytics-card">
                    <div class="shop-analytics-header">
                        <h4>${row.shop_name || "Unknown"}</h4>
                    </div>
                    <div class="shop-analytics-stats">
                        <div class="shop-stat">
                            <i class="fas fa-dollar-sign"></i>
                            <div class="shop-stat-content">
                                <span class="shop-stat-value">$${(parseFloat(row.total_revenue)||0).toLocaleString()}</span>
                                <span class="shop-stat-label">Revenue</span>
                            </div>
                        </div>
                        <div class="shop-stat">
                            <i class="fas fa-shopping-cart"></i>
                            <div class="shop-stat-content">
                                <span class="shop-stat-value">${(parseFloat(row.total_transactions)||0).toLocaleString()}</span>
                                <span class="shop-stat-label">Transactions</span>
                            </div>
                        </div>
                        <div class="shop-stat">
                            <i class="fas fa-users"></i>
                            <div class="shop-stat-content">
                                <span class="shop-stat-value">${(parseFloat(row.unique_customers)||0).toLocaleString()}</span>
                                <span class="shop-stat-label">Customers</span>
                            </div>
                        </div>
                    </div>
                    <div class="shop-analytics-footer">
                        <button class="action-btn analytics" data-shop-name="${row.shop_name}">
                            <i class="fas fa-chart-bar"></i> View Full Analytics
                        </button>
                    </div>
                </div>
            `);
        });
        container.append(grid);
    }

    // ── Analytics detail modal (single shop) ──────────────────
    function showShopAnalyticsModal(analytics) {
        if (!analytics) return;

        let modal = $("#analytics-modal");
        if (!modal.length) {
            $("body").append(`
                <div id="analytics-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:none;align-items:center;justify-content:center;">
                    <div class="analytics-modal-container" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;width:820px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 25px 80px rgba(0,0,0,0.8);">
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid #2a2a2a;flex-shrink:0;">
                            <h2 id="analytics-modal-title" style="margin:0;color:#e5e7eb;font-size:16px;font-weight:600;font-family:'Inter','Segoe UI',sans-serif;letter-spacing:0.02em;">Shop Analytics</h2>
                            <button id="close-analytics-modal" style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:6px;color:#9ca3af;font-size:18px;cursor:pointer;line-height:1;padding:4px 10px;transition:all 0.15s;">&times;</button>
                        </div>
                        <div id="analytics-modal-body" style="padding:24px;overflow-y:auto;flex:1;"></div>
                    </div>
                </div>
            `);
            modal = $("#analytics-modal");
            $("body").on("click", "#close-analytics-modal", function() { modal.fadeOut(200); });
            modal.on("click", function(e) { if (e.target === this) modal.fadeOut(200); });
        }

        $("#analytics-modal-title").text("Analytics: " + analytics.shopName);

        const totalRevenue      = parseFloat(analytics.totalRevenue)      || 0;
        const totalTransactions = parseFloat(analytics.totalTransactions)  || 0;
        const uniqueCustomers   = parseFloat(analytics.uniqueCustomers)    || 0;
        const avgOrder          = totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(0) : 0;

        const cardStyle = "background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;padding:18px 16px;text-align:center;";
        const labelStyle = "color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-family:'Inter','Segoe UI',sans-serif;";
        const valueStyle = "color:#e5e7eb;font-size:22px;font-weight:700;font-family:'Inter','Segoe UI',sans-serif;";
        const iconStyle  = "font-size:18px;margin-bottom:8px;";

        function buildTable(cols, rows, emptyMsg) {
            if (!rows || !rows.length) return `<p style="color:#6b7280;font-size:13px;font-family:'Inter','Segoe UI',sans-serif;">${emptyMsg}</p>`;
            return `<table style="width:100%;border-collapse:collapse;font-size:13px;font-family:'Inter','Segoe UI',sans-serif;">
                <thead><tr style="color:#6b7280;text-align:left;border-bottom:1px solid #2a2a2a;text-transform:uppercase;letter-spacing:0.05em;font-size:11px;">
                    ${cols.map(c => `<th style="padding:8px ${c.pl||'8px'} 8px 0;font-weight:500;">${c.label}</th>`).join('')}
                </tr></thead>
                <tbody>${rows.map(r => `<tr style="border-bottom:1px solid #1f1f1f;">${cols.map(c => `<td style="padding:9px ${c.pl||'8px'} 9px 0;color:${c.color||'#9ca3af'};">${r[c.key]}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>`;
        }

        const topItemsData = (analytics.topItems||[]).map(i => ({
            item_label: i.item_label,
            total_sold: i.total_sold,
            total_revenue: "$" + (parseFloat(i.total_revenue)||0).toLocaleString()
        }));

        const recentData = (analytics.recentPurchases||[]).map(p => ({
            player_name: p.player_name,
            item_label: p.item_label,
            quantity: p.quantity,
            total_cost: "$" + (parseFloat(p.total_cost)||0).toLocaleString(),
            currency_type: p.currency_type
        }));

        const revenueData = (analytics.recentRevenue||[]).map(r => ({
            date: formatAnalyticsDate(r.date),
            total_revenue: "$" + (parseFloat(r.total_revenue)||0).toLocaleString(),
            total_transactions: r.total_transactions
        }));

        $("#analytics-modal-body").html(`
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
                <div style="${cardStyle}">
                    <div style="${iconStyle}color:#10b981;"><i class="fas fa-dollar-sign"></i></div>
                    <div style="${labelStyle}">Total Revenue</div>
                    <div style="${valueStyle}">$${totalRevenue.toLocaleString()}</div>
                </div>
                <div style="${cardStyle}">
                    <div style="${iconStyle}color:#3b82f6;"><i class="fas fa-shopping-cart"></i></div>
                    <div style="${labelStyle}">Transactions</div>
                    <div style="${valueStyle}">${totalTransactions.toLocaleString()}</div>
                </div>
                <div style="${cardStyle}">
                    <div style="${iconStyle}color:#8b5cf6;"><i class="fas fa-users"></i></div>
                    <div style="${labelStyle}">Unique Customers</div>
                    <div style="${valueStyle}">${uniqueCustomers.toLocaleString()}</div>
                </div>
                <div style="${cardStyle}">
                    <div style="${iconStyle}color:#f59e0b;"><i class="fas fa-chart-line"></i></div>
                    <div style="${labelStyle}">Avg Order Value</div>
                    <div style="${valueStyle}">$${parseFloat(avgOrder).toLocaleString()}</div>
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <h3 style="color:#e5e7eb;font-size:13px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:8px;font-family:'Inter','Segoe UI',sans-serif;letter-spacing:0.02em;text-transform:uppercase;">
                    <i class="fas fa-fire" style="color:#f59e0b;"></i> Top Selling Items
                </h3>
                ${buildTable(
                    [{label:"Item",key:"item_label",color:"#f9fafb",pl:"0"},{label:"Sold",key:"total_sold",color:"#10b981"},{label:"Revenue",key:"total_revenue",color:"#3b82f6"}],
                    topItemsData, "No item sales data yet."
                )}
            </div>

            <div style="margin-bottom:20px;">
                <h3 style="color:#e5e7eb;font-size:13px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:8px;font-family:'Inter','Segoe UI',sans-serif;letter-spacing:0.02em;text-transform:uppercase;">
                    <i class="fas fa-calendar" style="color:#3b82f6;"></i> Last 7 Days Revenue
                </h3>
                ${buildTable(
                    [{label:"Date",key:"date",color:"#f9fafb",pl:"0"},{label:"Revenue",key:"total_revenue",color:"#10b981"},{label:"Transactions",key:"total_transactions",color:"#3b82f6"}],
                    revenueData, "No revenue data in the last 7 days."
                )}
            </div>

            <div>
                <h3 style="color:#e5e7eb;font-size:13px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:8px;font-family:'Inter','Segoe UI',sans-serif;letter-spacing:0.02em;text-transform:uppercase;">
                    <i class="fas fa-clock" style="color:#10b981;"></i> Recent Purchases
                </h3>
                ${buildTable(
                    [{label:"Player",key:"player_name",color:"#f9fafb",pl:"0"},{label:"Item",key:"item_label",color:"#d1d5db"},{label:"Qty",key:"quantity",color:"#d1d5db"},{label:"Total",key:"total_cost",color:"#10b981"},{label:"Currency",key:"currency_type",color:"#9ca3af"}],
                    recentData, "No recent purchases."
                )}
            </div>
        `);

        modal.css("display", "flex").hide().fadeIn(200);
    }

});