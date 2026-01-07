// 1. DATABASE SETUP
const db = new Dexie("MyStoreDB");
db.version(1).stores({
    products: "++id, name, price, stock, category, photo",
    sales: "++id, timestamp, total, itemCount, items"
});

let cart = [];
let currentCategory = "All";
let searchQuery = "";
let currencySymbol = localStorage.getItem('selectedCurrency') || "₦";

// 2. AUTH & STARTUP
function handleLogin() {
    const name = document.getElementById('shop-name-input').value;
    const pin = document.getElementById('shop-pin-input').value;
    if (name && pin === "1234") {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('shopName', name);
        startApp();
    } else { alert("Wrong PIN"); }
}

function handleLogout() {
    localStorage.clear();
    location.reload();
}

async function startApp() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'block';
    
    // Get the name from storage
    const savedName = localStorage.getItem('shopName') || "My Store";
    
    // Update all UI elements
    document.getElementById('display-name').innerText = savedName;
    document.getElementById('copyright-shop-name').innerText = savedName;
    document.getElementById('edit-shop-name-input').value = savedName;

    await db.open();
    renderProducts();
    updateDailyTotal();
    setupScroll();
}

// 3. PRODUCT LOGIC
async function renderProducts() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = "";
    let products = await db.products.toArray();

    const filtered = products.filter(p => {
        const matchesCat = (currentCategory === "All" || p.category === currentCategory);
        const matchesSearch = p.name.toLowerCase().includes(searchQuery);
        return matchesCat && matchesSearch;
    });

    filtered.forEach(p => {
        const isLowStock = p.stock > 0 && p.stock <= 5;
        const isOutOfStock = p.stock <= 0;
        let bgColor = isOutOfStock ? "#f0f0f0" : (isLowStock ? "#fff9c4" : "white");

        const card = document.createElement('div');
        card.style = `border:1px solid #ddd; padding:10px; border-radius:10px; background:${bgColor}; text-align:center; cursor:pointer; position:relative;`;
        
        card.innerHTML = `
            <div style="position:absolute; top:5px; right:5px; display:flex; gap:3px;">
                <button onclick="editPrice(event, ${p.id})" style="background:#ffc107; border:none; border-radius:50%; width:20px; height:20px;">✎</button>
                <button onclick="restockProduct(event, ${p.id})" style="background:#28a745; color:white; border:none; border-radius:50%; width:20px; height:20px;">+</button>
                <button onclick="deleteProduct(event, ${p.id})" style="background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer;">×</button>
            </div>
            <img src="${p.photo || 'https://via.placeholder.com/100'}" style="width:100%; height:80px; object-fit:cover; border-radius:5px;">
            <b>${p.name}</b><br>
            <span style="color:green;">${currencySymbol}${p.price.toLocaleString()}</span><br>
            <small>Stock: ${p.stock}</small>
        `;
        card.onclick = () => addToCart(p);
        grid.appendChild(card);
    });
}

// 4. CART LOGIC
function addToCart(p) {
    if (p.stock <= 0) return alert("Out of stock");
    const existing = cart.find(i => i.id === p.id);
    if (existing) {
        if (existing.quantity < p.stock) existing.quantity++;
        else alert("Low stock");
    } else {
        cart.push({...p, quantity: 1});
    }
    renderCart();
}

function renderCart() {
    const list = document.getElementById('cart-list');
    list.innerHTML = "";
    let total = 0;
    cart.forEach((item, idx) => {
        total += (item.price * item.quantity);
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                <div>${item.name}<br><small>${currencySymbol}${item.price}</small></div>
                <div>
                    <button onclick="updateCartQty(${idx},-1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateCartQty(${idx},1)">+</button>
                </div>
                <b>${currencySymbol}${(item.price * item.quantity).toLocaleString()}</b>
            </div>`;
    });
    document.getElementById('cart-total').innerText = currencySymbol + total.toLocaleString();
}

function updateCartQty(idx, change) {
    cart[idx].quantity += change;
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    renderCart();
}

function clearFullCart() { if(confirm("Clear order?")) { cart = []; renderCart(); } }

// 5. CHECKOUT & REPORTS
async function handleCheckout() {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Receipt UI
    showReceiptLogo();
    const receiptItems = document.getElementById('receipt-items');
    receiptItems.innerHTML = `<small>${new Date().toLocaleString()}</small><br><br>`;
    
    for (let item of cart) {
        receiptItems.innerHTML += `<div style="display:flex; justify-content:space-between;">
            <span>${item.name} x${item.quantity}</span>
            <span>${currencySymbol}${(item.price * item.quantity).toLocaleString()}</span>
        </div>`;
        const dbItem = await db.products.get(item.id);
        await db.products.update(item.id, { stock: dbItem.stock - item.quantity });
    }

    await db.sales.add({
        timestamp: Date.now(),
        total: total,
        items: cart.map(i => ({name: i.name, price: i.price, quantity: i.quantity}))
    });

    document.getElementById('receipt-total').innerText = currencySymbol + total.toLocaleString();
    document.getElementById('receipt-modal').style.display = 'flex';
    updateDailyTotal();
}

async function voidTransaction() {
    if (!confirm("Void this sale?")) return;
    const lastSale = await db.sales.orderBy('id').last();
    for (let item of cart) {
        const dbItem = await db.products.get(item.id);
        await db.products.update(item.id, { stock: dbItem.stock + item.quantity });
    }
    if (lastSale) await db.sales.delete(lastSale.id);
    closeReceipt();
}

async function deleteProduct(event, id) {
    // Stop the click from adding the item to the cart
    event.stopPropagation();
    
    if (confirm("Are you sure you want to delete this product? This cannot be undone.")) {
        try {
            await db.products.delete(id);
            renderProducts(); // Refresh the grid
        } catch (error) {
            console.error("Error deleting product:", error);
            alert("Could not delete product.");
        }
    }
}

function closeReceipt() {
    document.getElementById('receipt-modal').style.display = 'none';
    cart = []; renderCart(); renderProducts(); updateDailyTotal();
}

// 6. EXPORTS
async function exportToCSV() {
    const sales = await db.sales.toArray();
    if (sales.length === 0) return alert("No sales data to export.");

    // CSV Headers
    let csv = "Date,Time,Item Name,Item Price,Quantity,Subtotal\n";
    let grandTotal = 0;

    sales.forEach(sale => {
        const date = new Date(sale.timestamp).toLocaleDateString();
        const time = new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                const subtotal = item.price * item.quantity;
                grandTotal += subtotal;
                
                // Clean the name of any commas to avoid breaking CSV columns
                const cleanName = item.name.replace(/,/g, "");
                
                csv += `${date},${time},${cleanName},${item.price},${item.quantity},${subtotal}\n`;
            });
        }
    });

    // Add a blank line and then the overall total
    csv += `\n,,,OVERALL TOTAL,,${grandTotal}\n`;

    // Download Logic
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Detailed_Sales_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function exportStockReport() {
    const products = await db.products.toArray();
    let csv = "Product,Price,Stock,Status\n";
    products.forEach(p => {
        csv += `${p.name},${p.price},${p.stock},${p.stock <= 5 ? 'LOW' : 'OK'}\n`;
    });
    downloadCSV(csv, "Stock_Report.csv");
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename; a.click();
}

// 7. HELPERS
async function addNewProduct() {
    const name = document.getElementById('add-name').value;
    const price = parseFloat(document.getElementById('add-price').value);
    const stock = parseInt(document.getElementById('add-stock').value);
    const category = document.getElementById('add-cat').value;
    const file = document.getElementById('add-photo-file').files[0];
    let photo = file ? await fileToBase64(file) : "";
    if (name && price) {
        await db.products.add({ name, price, stock, category, photo });
        renderProducts();
    }
}

async function editPrice(e, id) {
    e.stopPropagation();
    const p = await db.products.get(id);
    const np = prompt("New Price:", p.price);
    if (np) { await db.products.update(id, {price: parseFloat(np)}); renderProducts(); }
}

async function restockProduct(e, id) {
    e.stopPropagation();
    const p = await db.products.get(id);
    const amt = prompt("How many items received?", "10");
    if (amt) { await db.products.update(id, {stock: p.stock + parseInt(amt)}); renderProducts(); }
}

async function updateDailyTotal() {
    const today = new Date().setHours(0,0,0,0);
    const sales = await db.sales.toArray();
    const revenue = sales.filter(s => s.timestamp >= today).reduce((a, b) => a + b.total, 0);
    document.getElementById('today-revenue').innerText = currencySymbol + revenue.toLocaleString();
}

function fileToBase64(file) {
    return new Promise(r => { const rd = new FileReader(); rd.readAsDataURL(file); rd.onload = () => r(rd.result); });
}

function showReceiptLogo() {
    const logo = localStorage.getItem('shopLogo');
    const img = document.getElementById('receipt-logo-display');
    if(logo) { img.src = logo; img.style.display = 'block'; }
}

async function uploadLogo() {
    const file = document.getElementById('shop-logo-file').files[0];
    if(file) { localStorage.setItem('shopLogo', await fileToBase64(file)); alert("Logo Saved"); }
}

function handleSearch() { searchQuery = document.getElementById('search-input').value.toLowerCase(); renderProducts(); }
function setCategory(c) { currentCategory = c; renderProducts(); }

function setupScroll() {
    const area = document.querySelector('.products');
    const btn = document.getElementById('back-to-top');
    area.onscroll = () => btn.style.display = area.scrollTop > 300 ? 'block' : 'none';
}

function toggleGuide() {
    const guide = document.getElementById('guide-modal');
    if (guide.style.display === 'none' || guide.style.display === '') {
        guide.style.display = 'flex';
    } else {
        guide.style.display = 'none';
    }
}

function changeCurrency() {
    const selector = document.getElementById('currency-select');
    currencySymbol = selector.value;
    localStorage.setItem('selectedCurrency', currencySymbol);
    
    // Refresh everything to show the new symbol
    renderProducts();
    renderCart();
    updateDailyTotal();
}

function updateShopName() {
    const newName = document.getElementById('edit-shop-name-input').value;
    
    if (newName.trim() === "") {
        alert("Please enter a valid name");
        return;
    }

    // 1. Save to memory
    localStorage.setItem('shopName', newName);

    // 2. Update Header
    document.getElementById('display-name').innerText = newName;

    // 3. Update Copyright
    document.getElementById('copyright-shop-name').innerText = newName;

    // 4. Update Receipt Title (for the next sale)
    document.getElementById('receipt-shop-name').innerText = newName;

    alert("Shop name updated to: " + newName);
}

if (localStorage.getItem('isLoggedIn') === 'true') startApp();
