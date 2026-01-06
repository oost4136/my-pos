// 1. DB SETUP
const db = new Dexie("MyStoreDB");
db.version(1).stores({
    products: "++id, name, price, stock, category, photo",
    sales: "++id, timestamp, total, itemCount, isSynced"
});

let cart = [];
let currentCategory = "All";
let searchQuery = "";

// Added currency logic
let currencySymbol = localStorage.getItem('selectedCurrency') || "₦";

function changeCurrency() {
    currencySymbol = document.getElementById('currency-select').value;
    localStorage.setItem('selectedCurrency', currencySymbol);
    renderProducts();
    renderCart();
}

// 2. HELPERS
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 3. AUTH
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

// 4. POS LOGIC
async function renderProducts() {
    const grid = document.getElementById('product-grid');
    if(!grid) return;
    grid.innerHTML = "";
    
    let products = await db.products.toArray();
    
    const filtered = products.filter(p => {
        const matchesCat = (currentCategory === "All" || p.category === currentCategory);
        const matchesSearch = p.name.toLowerCase().includes(searchQuery);
        return matchesCat && matchesSearch;
    });

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'p-card';
        
        const isLowStock = p.stock > 0 && p.stock < 3;
        const isOutOfStock = p.stock <= 0;
        let bgColor = isLowStock ? "#fff3f3" : (isOutOfStock ? "#f0f0f0" : "white");

        card.style = `border:1px solid #ddd; padding:10px; border-radius:10px; background:${bgColor}; text-align:center; cursor:pointer; position:relative; margin:5px;`;
        
        const imgUrl = p.photo || "https://via.placeholder.com/100?text=No+Image";
        
        card.innerHTML = `
            <div style="position:absolute; top:5px; right:5px; display:flex; gap:5px;">
                <button onclick="editPrice(event, ${p.id})" style="background:#ffc107; color:black; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:12px;">✎</button>
                
                <button onclick="restockProduct(event, ${p.id})" style="background:#28a745; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:14px;">+</button>
                
                <button onclick="deleteProduct(event, ${p.id})" style="background:red; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:14px;">×</button>
            </div>
            
            <img src="${imgUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:5px;">
            <b style="display:block; margin-top:5px;">${p.name}</b>
            <span style="color:green;">${currencySymbol}${parseFloat(p.price).toFixed(2)}</span><br>
            <small style="color: ${isLowStock ? 'red' : '#666'}; font-weight: ${isLowStock ? 'bold' : 'normal'}">
                ${isOutOfStock ? 'OUT OF STOCK' : 'Stock: ' + p.stock}
            </small>
        `;
        
        card.onclick = () => addToCart(p);
        grid.appendChild(card);
    });
}

function addToCart(p) {
    if (p.stock <= 0) return alert("Out of stock");
    
    // Check if item already exists in cart
    const existingItem = cart.find(item => item.id === p.id);
    
    if (existingItem) {
        if (existingItem.quantity < p.stock) {
            existingItem.quantity += 1;
        } else {
            alert("Cannot add more than available stock!");
        }
    } else {
        // Add new item with quantity 1
        cart.push({ ...p, quantity: 1 });
    }
    renderCart();
}

function renderCart() {
    const list = document.getElementById('cart-list');
    const totalDisp = document.getElementById('cart-total');
    list.innerHTML = "";
    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const row = document.createElement('div');
        row.style = "display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #eee;";
        
        row.innerHTML = `
            <div style="flex:1;">
                <strong style="display:block;">${item.name}</strong>
                <small style="color:#666;">${currencySymbol}${item.price.toFixed(2)} each</small>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:center;">
                <button onclick="updateCartQty(${index}, -1)" style="width:25px; height:25px; border-radius:5px; border:1px solid #ccc; background:#f9f9f9; cursor:pointer;">-</button>
                <span style="font-weight:bold; min-width:20px; text-align:center;">${item.quantity}</span>
                <button onclick="updateCartQty(${index}, 1)" style="width:25px; height:25px; border-radius:5px; border:1px solid #ccc; background:#f9f9f9; cursor:pointer;">+</button>
            </div>

            <div style="flex:1; text-align:right;">
                <span style="font-weight:bold;">${currencySymbol}${itemTotal.toFixed(2)}</span>
                <button onclick="removeFromCart(${index})" style="background:none; border:none; color:#ff4d4d; cursor:pointer; margin-left:10px;">&times;</button>
            </div>
        `;
        list.appendChild(row);
    });
    totalDisp.innerText = currencySymbol + total.toFixed(2);
}

function removeFromCart(i) { cart.splice(i, 1); renderCart(); }

function handleSearch() {
    searchQuery = document.getElementById('search-input').value.toLowerCase();
    renderProducts();
}

function setCategory(cat) {
    currentCategory = cat;
    renderProducts();
}

// 5. ADMIN & DATABASE

async function handleCheckout() {
    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const receiptItems = document.getElementById('receipt-items');
    receiptItems.innerHTML = "";

    for (let item of cart) {
        // Show quantity on receipt
        receiptItems.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>${item.name} (x${item.quantity})</span>
                <span>${currencySymbol}${(item.price * item.quantity).toFixed(2)}</span>
            </div>`;
        
        // Update stock by the quantity sold
        const dbItem = await db.products.get(item.id);
        if (dbItem) {
            await db.products.update(item.id, { stock: dbItem.stock - item.quantity });
        }
    }

    await db.sales.add({ 
        timestamp: Date.now(), 
        total: total, 
        itemCount: cart.reduce((sum, item) => sum + item.quantity, 0)
    });

    document.getElementById('receipt-total').innerText = `${currencySymbol}${total.toFixed(2)}`;
    document.getElementById('receipt-modal').style.display = 'flex';
    updateDailyTotal();
}

function closeReceipt() {
    document.getElementById('receipt-modal').style.display = 'none';
    cart = [];
    renderCart();
    renderProducts();
}

async function addNewProduct() {
    const name = document.getElementById('add-name').value;
    const price = parseFloat(document.getElementById('add-price').value);
    const stock = parseInt(document.getElementById('add-stock').value);
    const cat = document.getElementById('add-cat').value;
    const file = document.getElementById('add-photo-file').files[0];
    
    let photo = "";
    if (file) photo = await fileToBase64(file);

    if (name && price) {
        await db.products.add({ name, price, stock, category: cat, photo });
        renderProducts();
    }
}

async function deleteProduct(e, id) {
    e.stopPropagation();
    if(confirm("Delete?")) { await db.products.delete(id); renderProducts(); }
}

function exportToCSV() {
    db.sales.toArray().then(sales => {
        let csv = "Date,Total\n";
        sales.forEach(s => csv += `${new Date(s.timestamp).toLocaleDateString()},${s.total}\n`);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
        a.download = 'sales.csv'; a.click();
    });
}

// 6. START

    async function startApp() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'block';
    document.getElementById('display-name').innerText = localStorage.getItem('shopName');
    
    if(document.getElementById('currency-select')) {
        document.getElementById('currency-select').value = currencySymbol;
    }

    await db.open();
    renderProducts();
    updateDailyTotal(); // <--- Add this line here
}

async function restockProduct(event, id) {
    event.stopPropagation();
    const product = await db.products.get(id);
    const amount = prompt(`Restocking "${product.name}". How many items did you receive?`, "10");
    if (amount !== null && !isNaN(amount)) {
        const newStock = product.stock + parseInt(amount);
        await db.products.update(id, { stock: newStock });
        renderProducts();
    }
}

    async function updateDailyTotal() {
    const today = new Date().setHours(0,0,0,0);
    const allSales = await db.sales.toArray();
    
    const todaysSales = allSales.filter(sale => sale.timestamp >= today);
    
    // Using Number() ensures we don't accidentally "glue" text together
    const totalRevenue = todaysSales.reduce((sum, sale) => sum + Number(sale.total), 0);
    
    const revenueDisplay = document.getElementById('today-revenue');
    if (revenueDisplay) {
        revenueDisplay.innerText = `${currencySymbol}${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }
}

async function resetSalesData() {
    const confirmReset = confirm("Are you sure? This will delete all sales history and reset today's total to ₦0.00. Your products will stay safe.");
    
    if (confirmReset) {
        // Clear only the sales table
        await db.sales.clear();
        
        // Refresh the daily total display
        updateDailyTotal();
        
        alert("Sales history cleared successfully!");
    }
}

    function updateCartQty(index, change) {
    const item = cart[index];
    const newQty = item.quantity + change;

    // 1. If quantity goes to 0, remove it from the cart
    if (newQty <= 0) {
        removeFromCart(index);
    } 
    // 2. Prevent adding more than what is in stock
    else if (newQty > item.stock) {
        alert("Not enough stock available!");
    } 
    // 3. Otherwise, update the quantity and refresh the cart display
    else {
        item.quantity = newQty;
        renderCart();
    }
}

    // 1. Function to Change Product Price
async function editPrice(event, id) {
    event.stopPropagation();
    const product = await db.products.get(id);
    const newPrice = prompt(`Enter new price for ${product.name}:`, product.price);
    
    if (newPrice !== null && !isNaN(newPrice) && newPrice > 0) {
        await db.products.update(id, { price: parseFloat(newPrice) });
        renderProducts();
        renderCart(); // Update cart in case the item is already there
    }
}

// 2. Back to Top Visibility Logic
window.onscroll = function() {
    const btn = document.getElementById("back-to-top");
    if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
        btn.style.display = "block";
    } else {
        btn.style.display = "none";
    }

    // This listens to the Products area scrolling instead of the whole window
document.addEventListener('DOMContentLoaded', () => {
    const productsArea = document.querySelector('.products');
    const btn = document.getElementById("back-to-top");

    if(productsArea) {
        productsArea.onscroll = function() {
            if (productsArea.scrollTop > 300) {
                btn.style.display = "block";
            } else {
                btn.style.display = "none";
            }
        };
    }
});
    
};

async function voidTransaction() {
    if (!confirm("Are you sure you want to void this sale? Items will return to stock.")) return;

    // 1. Put stock back
    for (let item of cart) {
        const dbItem = await db.products.get(item.id);
        if (dbItem) {
            await db.products.update(item.id, { stock: dbItem.stock + item.quantity });
        }
    }

    // 2. Delete last sale record
    const lastSale = await db.sales.orderBy('id').last();
    if (lastSale) {
        await db.sales.delete(lastSale.id);
    }

    // 3. Reset UI
    document.getElementById('receipt-modal').style.display = 'none';
    cart = []; // Clear cart after voiding
    renderProducts();
    renderCart();
    updateDailyTotal();
}

if (localStorage.getItem('isLoggedIn') === 'true') { startApp(); }  