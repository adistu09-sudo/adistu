import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  connectAuthEmulator,
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const API_BASE = "/api";
const accountOptions = document.querySelectorAll(".account-option");
const heading = document.querySelector("#login-heading");
const intro = document.querySelector(".login-intro");
const signupCopy = document.querySelector("#signup-copy");
const signupLink = document.querySelector("#signup-link");
const form = document.querySelector("#login-form");
const accountNameInput = document.querySelector("#account-name");
const registrationName = document.querySelector("#registration-name");
const confirmationCodeGroup = document.querySelector("#confirmation-code-group");
const confirmationCodeInput = document.querySelector("#confirmation-code");
const identityInput = document.querySelector("#identity");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const message = document.querySelector("#form-message");
const googleButton = document.querySelector("#google-button");
const forgotLink = document.querySelector("#forgot-link");
const loginPage = document.querySelector("#login-page");
const buyerApp = document.querySelector("#buyer-app");
const buyerName = document.querySelector("#buyer-name");
const buyerAvatar = document.querySelector("#buyer-avatar");
const radiusRange = document.querySelector("#radius-range");
const radiusValue = document.querySelector("#radius-value");
const radiusResult = document.querySelector("#radius-result");
const feedList = document.querySelector("#feed-list");
const feedNotice = document.querySelector("#feed-notice");
const locationButton = document.querySelector("#location-button");
const signoutButton = document.querySelector("#signout-button");
const sellerApp = document.querySelector("#seller-app");
const sellerName = document.querySelector("#seller-name");
const sellerAvatar = document.querySelector("#seller-avatar");
const sellerWelcomeName = document.querySelector("#seller-welcome-name");
const sellerNotice = document.querySelector("#seller-notice");
const productForm = document.querySelector("#product-form");
const sellerProductList = document.querySelector("#seller-product-list");
const productCount = document.querySelector("#product-count");
const workerForm = document.querySelector("#worker-form");
const workerList = document.querySelector("#worker-list");
const workerCount = document.querySelector("#worker-count");
const shopForm = document.querySelector("#shop-form");
const sellerSignoutButton = document.querySelector("#seller-signout-button");

const icons = {
  like: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17s-7-4.2-7-9a3.8 3.8 0 0 1 7-2.1A3.8 3.8 0 0 1 17 8c0 4.8-7 9-7 9Z"/></svg>',
  comment: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17 9.3a6.8 6.8 0 0 1-7.2 6.8 7.7 7.7 0 0 1-3-.6L3 17l1.3-3.2a6.6 6.6 0 0 1-1.5-4.2A6.8 6.8 0 0 1 10 2.8 6.8 6.8 0 0 1 17 9.3Z"/></svg>',
  share: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 10.5v5.2c0 .7.6 1.3 1.3 1.3h9.4c.7 0 1.3-.6 1.3-1.3v-5.2"/></svg>',
  save: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5h10v14l-5-3.4-5 3.4v-14Z"/></svg>'
};

let accountType = "buyer";
let registering = false;
let pendingConfirmation = false;
let currentUser = null;
let firebaseAuth = null;
let firebaseReady;
let phoneConfirmation = null;
let phoneRegistration = false;
let recaptchaVerifier = null;
let userLocation = null;
let commentOpenIds = new Set();
let radiusTimer;
let sellerProducts = [];
let sellerWorkers = [];
let adsenseLoadPromise;
const adCardsByPosition = new Map();

function clearAuth() {
  if (firebaseAuth?.currentUser) void firebaseSignOut(firebaseAuth);
}

async function readApiJson(response) {
  try {
    return await response.json();
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(
      `Adistu's API returned non-JSON data (HTTP ${response.status}, ${contentType}). ` +
      "Check that the site is served by Firebase Hosting and its /api/** rewrite is deployed."
    );
  }
}

function initializeFirebase() {
  if (!firebaseReady) {
    firebaseReady = (async () => {
      if (window.location.protocol === "file:") {
        throw new Error(
          "Adistu can't sign in when opened directly from a file. Open the Firebase Hosting URL " +
          "or run the site through Firebase Hosting so /api/config can reach the backend."
        );
      }
      const response = await fetch(`${API_BASE}/config`);
      const config = await readApiJson(response);
      if (!response.ok || !config.apiKey || !config.projectId || !config.appId) {
        throw new Error("Firebase Authentication is not configured for this deployment.");
      }
      firebaseAuth = getAuth(initializeApp(config));
      if (config.authEmulatorUrl) {
        connectAuthEmulator(firebaseAuth, config.authEmulatorUrl, { disableWarnings: true });
      }
      return firebaseAuth;
    })();
  }
  return firebaseReady;
}

async function saveAuth(user) {
  await user.getIdToken(true);
}

async function saveProfile(user, name, type) {
  await saveAuth(user);
  await requestJson(`${API_BASE}/auth/profile`, {
    method: "POST",
    body: JSON.stringify({ name, account_type: type })
  });
}

function showMessage(text, isSuccess = false) {
  message.textContent = text;
  message.classList.toggle("is-success", isSuccess);
}

function showFeedMessage(text, isError = false) {
  feedNotice.textContent = text;
  feedNotice.classList.toggle("is-error", isError);
}

async function requestJson(url, options = {}) {
  const idToken = firebaseAuth?.currentUser
    ? await firebaseAuth.currentUser.getIdToken()
    : null;
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    ...options.headers
  };
  const response = await fetch(url, { ...options, headers });
  const data = await readApiJson(response);
  if (!response.ok) {
    const error = new Error(data.detail || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function addIconButton(parent, action, label, icon, count, pressed = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `feed-action${pressed ? " is-liked" : ""}`;
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  if (action === "like" || action === "save") button.setAttribute("aria-pressed", String(pressed));
  button.innerHTML = icons[icon];
  if (count !== null) button.append(createElement("span", "", String(count)));
  parent.append(button);
  return button;
}

function createComment(comment) {
  const element = createElement("p", "product-comment");
  const author = createElement("strong", "", comment.author);
  element.append(author, document.createTextNode(` ${comment.body}`));
  return element;
}

function showLogin() {
  loginPage.hidden = false;
  buyerApp.hidden = true;
  sellerApp.hidden = true;
  document.body.classList.remove("feed-mode");
  document.title = "Sign in — Adistu";
}

function openBuyerFeed(user) {
  currentUser = user;
  buyerName.textContent = user.name;
  buyerAvatar.textContent = user.name.charAt(0).toUpperCase() || "B";
  loginPage.hidden = true;
  buyerApp.hidden = false;
  sellerApp.hidden = true;
  document.body.classList.add("feed-mode");
  document.title = "Discover local finds — Adistu";
  loadFeed();
}

function openSellerDashboard(user) {
  currentUser = user;
  sellerName.textContent = user.name;
  sellerAvatar.textContent = user.name.charAt(0).toUpperCase() || "S";
  sellerWelcomeName.textContent = user.name;
  loginPage.hidden = true;
  buyerApp.hidden = true;
  sellerApp.hidden = false;
  document.body.classList.add("feed-mode");
  document.title = "Seller dashboard — Adistu";
  loadSellerDashboard();
}

function openAccount(user) {
  if (user.account_type === "seller") openSellerDashboard(user);
  else openBuyerFeed(user);
}

function isPhoneIdentity(value = identityInput.value) {
  return value.trim().startsWith("+");
}

function updateIdentityMode() {
  const phoneMode = isPhoneIdentity();
  const passwordRow = document.querySelector(".password-label-row");
  const passwordWrap = passwordInput.closest(".input-wrap");
  passwordRow.hidden = phoneMode;
  passwordWrap.hidden = phoneMode;
  passwordInput.required = !phoneMode && !pendingConfirmation;
  forgotLink.hidden = phoneMode;
  document.querySelector(".submit-label").textContent = phoneMode
    ? pendingConfirmation ? "Verify phone number" : "Send SMS code"
    : registering ? `Create ${accountType} account` : "Sign in";
}

function setAccountType(type) {
  if (pendingConfirmation) clearConfirmationPrompt();
  accountType = type;
  registering = false;
  accountOptions.forEach((option) => {
    const selected = option.dataset.account === type;
    option.classList.toggle("is-active", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
  const isSeller = type === "seller";
  heading.innerHTML = isSeller ? "Welcome back,<br>maker." : "Sign in to your<br>little corner.";
  intro.textContent = isSeller
    ? registering ? "Create your seller account and set up your shop." : "Sign in to manage your shop and your team."
    : registering ? "Create your buyer account to get started." : "Pick up right where you left off.";
  signupCopy.textContent = registering ? "Already have an account?" : "New around here?";
  signupLink.textContent = registering ? "Sign in" : "Create an account";
  form.hidden = false;
  document.querySelector(".divider").hidden = isSeller;
  googleButton.hidden = isSeller;
  document.querySelector(".signup-prompt").hidden = false;
  document.querySelector(".legal-copy").hidden = isSeller;
  document.querySelector(".login-demo-note").hidden = isSeller;
  registrationName.hidden = !registering;
  accountNameInput.required = registering;
  document.querySelector(".submit-label").textContent = registering ? `Create ${isSeller ? "seller" : "buyer"} account` : "Sign in";
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  passwordInput.minLength = registering ? 8 : 1;
  updateIdentityMode();
  showMessage("");
}

function clearConfirmationPrompt() {
  pendingConfirmation = false;
  phoneConfirmation = null;
  phoneRegistration = false;
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
  confirmationCodeGroup.hidden = true;
  confirmationCodeInput.required = false;
  confirmationCodeInput.value = "";
  identityInput.readOnly = false;
  identityInput.closest(".input-wrap").hidden = false;
  document.querySelector('label[for="identity"]').hidden = false;
  document.querySelector(".password-label-row").hidden = false;
  passwordInput.closest(".input-wrap").hidden = false;
  registrationName.hidden = !registering;
  accountOptions.forEach((option) => { option.disabled = false; });
  updateIdentityMode();
}

function showConfirmationPrompt() {
  pendingConfirmation = true;
  confirmationCodeGroup.hidden = false;
  confirmationCodeInput.required = true;
  identityInput.readOnly = true;
  identityInput.closest(".input-wrap").hidden = true;
  document.querySelector('label[for="identity"]').hidden = true;
  document.querySelector(".password-label-row").hidden = true;
  passwordInput.closest(".input-wrap").hidden = true;
  registrationName.hidden = true;
  accountOptions.forEach((option) => { option.disabled = true; });
  document.querySelector(".submit-label").textContent = "Verify phone number";
  showMessage("Enter the SMS verification code sent to your phone.");
  confirmationCodeInput.focus();
}

function setRegistrationMode(enabled) {
  if (pendingConfirmation) clearConfirmationPrompt();
  registering = enabled;
  const isSeller = accountType === "seller";
  heading.innerHTML = enabled
    ? isSeller ? "Open your<br>little shop." : "Find your<br>little corner."
    : isSeller ? "Welcome back,<br>maker." : "Sign in to your<br>little corner.";
  intro.textContent = enabled
    ? `Create your ${isSeller ? "seller" : "buyer"} account to get started.`
    : isSeller ? "Sign in to manage your shop and your team." : "Pick up right where you left off.";
  signupCopy.textContent = enabled ? "Already have an account?" : "New around here?";
  signupLink.textContent = enabled ? "Sign in" : "Create an account";
  document.querySelector(".submit-label").textContent = enabled ? `Create ${isSeller ? "seller" : "buyer"} account` : "Sign in";
  passwordInput.autocomplete = enabled ? "new-password" : "current-password";
  passwordInput.minLength = enabled ? 8 : 1;
  registrationName.hidden = !enabled;
  accountNameInput.required = enabled;
  updateIdentityMode();
  showMessage("");
}

function requestLocation() {
  if (!navigator.geolocation) {
    showFeedMessage("Your browser doesn't provide location access. Enable it or try another browser.", true);
    return;
  }
  locationButton.disabled = true;
  showFeedMessage("Finding shops near you…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      locationButton.querySelector("span:last-child").textContent = "Location set";
      locationButton.disabled = false;
      showFeedMessage("Your location is used only to calculate distances. The feed currently contains sample shop listings.");
      loadFeed();
    },
    (error) => {
      locationButton.disabled = false;
      const reason = error.code === error.PERMISSION_DENIED
        ? "Location access was denied. Allow it in your browser settings to see nearby shops."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Your location is unavailable right now. Try again in a moment."
          : "Location lookup timed out. Please try again.";
      showFeedMessage(reason, true);
      renderEmptyState("Share your location to find nearby shops.", "Your location is only used to calculate distances and is not saved.");
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
  );
}

function renderEmptyState(title, description) {
  feedList.replaceChildren();
  const empty = createElement("div", "feed-empty");
  empty.append(
    createElement("span", "", "⌖"),
    createElement("h3", "", title),
    createElement("p", "", description)
  );
  feedList.append(empty);
}

function loadAdSense(clientId) {
  if (window.adsbygoogle) return Promise.resolve();
  if (!adsenseLoadPromise) {
    adsenseLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Google AdSense couldn't be loaded.")), { once: true });
      document.head.append(script);
    });
  }
  return adsenseLoadPromise;
}

function renderAdCard(position) {
  if (adCardsByPosition.has(position)) return adCardsByPosition.get(position);
  const card = createElement("aside", "feed-ad-card");
  card.dataset.adPosition = String(position);
  card.setAttribute("aria-label", "Advertisement");
  const label = createElement("span", "feed-ad-label", "Sponsored");
  const clientId = feedList.dataset.adsenseClient.trim();
  const slotId = feedList.dataset.adsenseSlot.trim();
  const adConfigured = /^ca-pub-\d+$/.test(clientId) && /^\d+$/.test(slotId);
  if (adConfigured) {
    const ad = createElement("ins", "adsbygoogle");
    ad.style.display = "block";
    ad.dataset.adClient = clientId;
    ad.dataset.adSlot = slotId;
    ad.dataset.adFormat = "auto";
    ad.dataset.fullWidthResponsive = "true";
    card.append(label, ad);
    adCardsByPosition.set(position, card);
    loadAdSense(clientId)
      .then(() => {
        if (ad.dataset.adRequested) return;
        ad.dataset.adRequested = "true";
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      })
      .catch((error) => {
        console.error(error);
        card.append(createElement("p", "feed-ad-unavailable", "AdSense is currently unavailable."));
      });
  } else {
    card.append(label, createElement("p", "feed-ad-unavailable", "AdSense publisher and ad unit IDs are required to show ads."));
    adCardsByPosition.set(position, card);
  }
  return card;
}

function renderFeedProducts(products) {
  const fragment = document.createDocumentFragment();
  products.forEach((product, index) => {
    fragment.append(renderProduct(product));
    if ((index + 1) % 10 === 0) {
      fragment.append(renderAdCard((index + 1) / 10));
    }
  });
  feedList.replaceChildren(fragment);
}

function renderProduct(product) {
  const card = createElement("article", "feed-card");
  card.dataset.productId = product.id;

  const imageWrap = createElement("div", "feed-image-wrap");
  const image = createElement("img", "feed-image");
  image.src = product.image_url;
  image.alt = product.image_alt;
  image.loading = "lazy";
  imageWrap.append(image, createElement("span", "product-distance", `${product.distance_km.toFixed(1)} km away`));
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = `save-button${product.saved ? " is-saved" : ""}`;
  saveButton.dataset.action = "save";
  saveButton.setAttribute("aria-label", product.saved ? "Remove saved item" : "Save item");
  saveButton.setAttribute("aria-pressed", String(product.saved));
  saveButton.innerHTML = icons.save;
  imageWrap.append(saveButton);

  const body = createElement("div", "feed-card-body");
  const shopLine = createElement("div", "shop-line");
  shopLine.append(createElement("span", "shop-avatar", product.shop.charAt(0)));
  const shopDetails = createElement("div");
  shopDetails.append(createElement("strong", "", product.shop), createElement("span", "", product.category));
  shopLine.append(shopDetails, createElement("span", "shop-check", "✳"));

  const titleRow = createElement("div", "product-title-row");
  titleRow.append(createElement("h3", "", product.name), createElement("strong", "product-price", `₹${Number(product.price).toLocaleString("en-IN")}`));
  const deliveryFee = Number(product.delivery_fee || 0);
  const delivery = createElement(
    "p",
    "product-delivery",
    deliveryFee > 0
      ? `Delivery ₹${deliveryFee.toLocaleString("en-IN", { minimumFractionDigits: 2 })} per order`
      : "Free delivery"
  );
  const actions = createElement("div", "feed-actions");
  addIconButton(actions, "like", `${product.liked ? "Unlike" : "Like"} ${product.name}`, "like", product.like_count, product.liked);
  addIconButton(actions, "comment", `Comment on ${product.name}`, "comment", product.comments.length);
  const shareButton = addIconButton(actions, "share", `Share ${product.name}`, "share", null);
  shareButton.append(createElement("span", "", "Share"));
  actions.append(createElement("span", "feed-action-spacer"));
  actions.append(createElement("span", "feed-like-copy", `${product.like_count} people love this`));

  const commentsArea = createElement("div", "comments-area");
  commentsArea.hidden = !commentOpenIds.has(product.id);
  const commentsList = createElement("div", "comments-list");
  product.comments.forEach((comment) => commentsList.append(createComment(comment)));
  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";
  const commentInput = document.createElement("input");
  commentInput.name = "comment";
  commentInput.maxLength = 240;
  commentInput.placeholder = "Add a kind comment...";
  commentInput.required = true;
  commentInput.setAttribute("aria-label", "Add a comment");
  const postButton = createElement("button", "", "Post");
  postButton.type = "submit";
  commentForm.append(commentInput, postButton);
  commentsArea.append(commentsList, commentForm);

  const shareStatus = createElement("p", "share-status");
  shareStatus.setAttribute("aria-live", "polite");
  body.append(shopLine, titleRow, delivery, actions, commentsArea, shareStatus);
  card.append(imageWrap, body);
  return card;
}

async function loadFeed() {
  radiusValue.textContent = radiusRange.value;
  if (!userLocation) {
    radiusResult.textContent = "Set your location to see nearby finds";
    renderEmptyState("Find local favorites.", "Set your location to see featured items from nearby shops.");
    return;
  }
  const radius = Number(radiusRange.value);
  radiusResult.textContent = "Finding nearby shops…";
  try {
    const result = await requestJson(`${API_BASE}/feed`, {
      method: "POST",
      body: JSON.stringify({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        radius_km: radius
      })
    });
    radiusResult.textContent = `${result.count} featured ${result.count === 1 ? "find" : "finds"} from shops within ${radius} km`;
    if (result.products.length === 0) {
      renderEmptyState("A little quiet out here.", "Try widening your shopping radius to find more local favorites.");
      return;
    }
    renderFeedProducts(result.products);
    showFeedMessage("Your location is used only to calculate distances for this search.");
  } catch (error) {
    if (error.status === 401) {
      currentUser = null;
      showLogin();
      showMessage("Your session expired. Please sign in again.");
      return;
    }
    showFeedMessage(error.message || "Couldn't load local shops. Please try again.", true);
    renderEmptyState("Your feed couldn't load.", "Please try again in a moment.");
  }
}

function setSellerNotice(text, isError = false) {
  sellerNotice.textContent = text;
  sellerNotice.classList.toggle("is-error", isError);
}

function renderSellerProducts() {
  sellerProductList.replaceChildren();
  productCount.textContent = `${sellerProducts.length} ${sellerProducts.length === 1 ? "product" : "products"}`;
  if (sellerProducts.length === 0) {
    sellerProductList.append(createElement("p", "seller-empty", "Your product list is empty. Add your first product to start building your catalog."));
    return;
  }

  sellerProducts.forEach((product) => {
    const card = createElement("article", "seller-product-card");
    const image = createElement("img", "seller-product-image");
    image.src = product.image_url;
    image.alt = product.name;
    image.loading = "lazy";
    const details = createElement("div", "seller-item-details");
    details.append(
      createElement("span", "seller-item-category", product.category),
      createElement("h4", "", product.name),
      createElement("p", "seller-item-description", product.description || "No description added."),
      createElement("p", "seller-item-stock", `₹${Number(product.price).toLocaleString("en-IN")} · ${product.stock} in stock`)
    );
    const remove = createElement("button", "remove-item-button", "Remove");
    remove.type = "button";
    remove.dataset.removeProduct = product.id;
    card.append(image, details, remove);
    sellerProductList.append(card);
  });
}

function renderWorkers() {
  workerList.replaceChildren();
  workerCount.textContent = `${sellerWorkers.length} ${sellerWorkers.length === 1 ? "team member" : "team members"}`;
  if (sellerWorkers.length === 0) {
    workerList.append(createElement("p", "seller-empty", "No team members yet. Add an employee, delivery worker, or both."));
    return;
  }

  const roleLabels = { employee: "Employee", delivery: "Delivery", both: "Employee + delivery" };
  sellerWorkers.forEach((worker) => {
    const card = createElement("article", "worker-card");
    const headingRow = createElement("div", "worker-card-heading");
    const identity = createElement("div", "worker-identity");
    identity.append(
      createElement("span", "worker-avatar", worker.name.charAt(0).toUpperCase()),
      createElement("div", "")
    );
    const names = identity.lastElementChild;
    names.append(createElement("h4", "", worker.name), createElement("span", "worker-nickname", `“${worker.nickname}”`));
    headingRow.append(identity, createElement("span", "worker-role", roleLabels[worker.role]));

    const info = createElement("dl", "worker-details");
    [
      ["Phone", worker.phone],
      ["Email", worker.email],
      ["Monthly salary", `₹${Number(worker.salary).toLocaleString("en-IN")}`],
      ["Shift", worker.shift]
    ].forEach(([label, value]) => {
      const group = createElement("div");
      group.append(createElement("dt", "", label), createElement("dd", "", value));
      info.append(group);
    });
    const remove = createElement("button", "remove-worker-button", "Remove from team");
    remove.type = "button";
    remove.dataset.removeWorker = worker.id;
    card.append(headingRow, info, remove);
    workerList.append(card);
  });
}

async function loadSellerDashboard() {
  setSellerNotice("Loading your shop dashboard…");
  try {
    const [shopResult, productResult, workerResult] = await Promise.all([
      requestJson(`${API_BASE}/seller/shop`),
      requestJson(`${API_BASE}/seller/products`),
      requestJson(`${API_BASE}/seller/workers`)
    ]);
    sellerProducts = productResult.products;
    sellerWorkers = workerResult.workers;
    renderSellerProducts();
    renderWorkers();
    if (shopResult.shop) {
      document.querySelector("#shop-name").value = shopResult.shop.name;
      document.querySelector("#shop-category").value = shopResult.shop.category;
      document.querySelector("#shop-latitude").value = shopResult.shop.latitude;
      document.querySelector("#shop-longitude").value = shopResult.shop.longitude;
      document.querySelector("#shop-delivery-fee").value = shopResult.shop.delivery_fee ?? 0;
      setSellerNotice("Your seller dashboard is ready.");
    } else {
      setSellerNotice("Start by saving your shop name, category, and location. Then add products for nearby buyers.", true);
      activateSellerTab("shop");
    }
  } catch (error) {
    setSellerNotice(error.message || "Couldn't load your seller dashboard.", true);
  }
}

function activateSellerTab(tabName) {
  document.querySelectorAll(".seller-nav-link").forEach((button) => {
    const selected = button.dataset.sellerTab === tabName;
    button.classList.toggle("is-current", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll(".seller-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabName;
  });
}

async function submitSellerForm(targetForm, url, onSuccess, method = "POST") {
  const submitButton = targetForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(targetForm).entries());
    const response = await requestJson(url, {
      method,
      body: JSON.stringify(data)
    });
    targetForm.reset();
    await onSuccess(response);
  } catch (error) {
    setSellerNotice(error.message || "Couldn't save your changes.", true);
  } finally {
    submitButton.disabled = false;
  }
}

accountOptions.forEach((option) => {
  option.addEventListener("click", () => setAccountType(option.dataset.account));
});

passwordToggle.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(shouldShow));
  passwordToggle.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  const identity = identityInput.value.trim();
  const password = passwordInput.value;
  const phoneMode = isPhoneIdentity(identity);
  if (registering && !pendingConfirmation && !accountNameInput.value.trim()) {
    showMessage("Enter your name to create an account.");
    accountNameInput.focus();
    return;
  }
  if (!identity && !pendingConfirmation) {
    showMessage("Enter your email address or phone number.");
    identityInput.focus();
    return;
  }
  if (!phoneMode && !password && !pendingConfirmation) {
    showMessage("Enter your password.");
    passwordInput.focus();
    return;
  }
  if (registering && !pendingConfirmation && !phoneMode && password.length < 8) {
    showMessage("Use at least 8 characters for your password.");
    passwordInput.focus();
    return;
  }
  if (phoneMode && !/^\+[1-9][0-9]{6,14}$/.test(identity.replace(/[\s().-]/g, ""))) {
    showMessage("Enter a valid phone number in international format, such as +14155550123.");
    identityInput.focus();
    return;
  }

  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  let phoneVerified = false;
  try {
    await initializeFirebase();
    let credential;
    if (pendingConfirmation) {
      credential = await phoneConfirmation.confirm(confirmationCodeInput.value.trim());
      phoneVerified = true;
      await saveAuth(credential.user);
      if (phoneRegistration) {
        await updateProfile(credential.user, { displayName: accountNameInput.value.trim() });
        await saveProfile(credential.user, accountNameInput.value.trim(), accountType);
      }
      const session = await requestJson(`${API_BASE}/auth/session`);
      if (session.user.account_type !== accountType) {
        throw new Error("This account does not have the selected account type.");
      }
      clearConfirmationPrompt();
      openAccount(session.user);
    } else if (phoneMode) {
      recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, "recaptcha-container", { size: "invisible" });
      phoneConfirmation = await signInWithPhoneNumber(
        firebaseAuth,
        identity.replace(/[\s().-]/g, ""),
        recaptchaVerifier
      );
      phoneRegistration = registering;
      showConfirmationPrompt();
    } else if (registering) {
      credential = await createUserWithEmailAndPassword(firebaseAuth, identity, password);
      await updateProfile(credential.user, { displayName: accountNameInput.value.trim() });
      await saveProfile(credential.user, accountNameInput.value.trim(), accountType);
      await sendEmailVerification(credential.user);
      await firebaseSignOut(firebaseAuth);
      clearAuth();
      setRegistrationMode(false);
      showMessage("Account created. Check your email for a verification link before signing in.", true);
    } else {
      credential = await signInWithEmailAndPassword(firebaseAuth, identity, password);
      await credential.user.reload();
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await firebaseSignOut(firebaseAuth);
        clearAuth();
        showMessage("Verify your email address using the link we just sent, then sign in again.");
        return;
      }
      await saveAuth(credential.user);
      const session = await requestJson(`${API_BASE}/auth/session`);
      if (session.user.account_type !== accountType) {
        throw new Error("This account does not have the selected account type.");
      }
      openAccount(session.user);
    }
  } catch (error) {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
    if (error.code === "auth/invalid-verification-code") {
      showMessage("That SMS verification code is invalid. Check it and try again.");
    } else if (error.code === "auth/too-many-requests") {
      showMessage("Too many attempts. Please wait before trying again.");
    } else {
      showMessage(error.message || "Couldn't reach the account service. Please try again.");
    }
    if (firebaseAuth?.currentUser && (!pendingConfirmation || phoneVerified)) {
      await firebaseSignOut(firebaseAuth);
      clearAuth();
      if (phoneVerified) clearConfirmationPrompt();
    }
  } finally {
    submitButton.disabled = false;
  }
});

googleButton.addEventListener("click", async () => {
  googleButton.disabled = true;
  try {
    await initializeFirebase();
    const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    await saveAuth(result.user);
    const session = await requestJson(`${API_BASE}/auth/session`);
    if (session.user.account_type !== "buyer") {
      throw new Error("Google sign-in is only available for buyer accounts.");
    }
    openAccount(session.user);
  } catch (error) {
    showMessage(error.message || "Google sign-in couldn't be completed.");
    if (firebaseAuth?.currentUser) {
      await firebaseSignOut(firebaseAuth);
      clearAuth();
    }
  } finally {
    googleButton.disabled = false;
  }
});

forgotLink.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!identityInput.value.trim() || isPhoneIdentity()) {
    showMessage("Enter the email address for the account to receive a password reset link.");
    identityInput.focus();
    return;
  }
  try {
    await initializeFirebase();
    await sendPasswordResetEmail(firebaseAuth, identityInput.value.trim());
    showMessage("If an account exists for that email, a password reset link has been sent.", true);
  } catch (error) {
    showMessage(error.message || "A password reset email couldn't be sent.");
  }
});

signupLink.addEventListener("click", (event) => {
  event.preventDefault();
  setRegistrationMode(!registering);
});

identityInput.addEventListener("input", () => {
  updateIdentityMode();
  showMessage("");
});
passwordInput.addEventListener("input", () => showMessage(""));

locationButton.addEventListener("click", requestLocation);
radiusRange.addEventListener("input", () => {
  radiusValue.textContent = radiusRange.value;
  window.clearTimeout(radiusTimer);
  radiusTimer = window.setTimeout(loadFeed, 250);
});

feedList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".feed-card");
  const productId = card.dataset.productId;
  const action = button.dataset.action;
  if (action === "comment") {
    if (commentOpenIds.has(productId)) commentOpenIds.delete(productId);
    else commentOpenIds.add(productId);
    button.setAttribute("aria-expanded", String(commentOpenIds.has(productId)));
    card.querySelector(".comments-area").hidden = !commentOpenIds.has(productId);
    if (commentOpenIds.has(productId)) card.querySelector('input[name="comment"]').focus();
    return;
  }
  if (action === "share") {
    const title = card.querySelector("h3").textContent;
    const shop = card.querySelector(".shop-line strong").textContent;
    const shareData = { title, text: `Found at ${shop} on Adistu`, url: window.location.href };
    const status = card.querySelector(".share-status");
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard) await navigator.clipboard.writeText(`${shareData.text} — ${shareData.url}`);
      else throw new Error("Sharing isn't available in this browser.");
      status.textContent = navigator.share ? "Thanks for sharing this local find." : "Link copied — share this find with a friend.";
    } catch (error) {
      if (error.name !== "AbortError") status.textContent = error.message || "Sharing couldn't be completed.";
    }
    return;
  }

  button.disabled = true;
  try {
    await requestJson(`${API_BASE}/products/${encodeURIComponent(productId)}/${action}`, { method: "POST" });
    await loadFeed();
  } catch (error) {
    showFeedMessage(error.message || "That action couldn't be saved.", true);
  } finally {
    button.disabled = false;
  }
});

feedList.addEventListener("submit", async (event) => {
  const commentForm = event.target.closest(".comment-form");
  if (!commentForm) return;
  event.preventDefault();
  const card = commentForm.closest(".feed-card");
  const input = commentForm.querySelector('input[name="comment"]');
  const body = input.value.trim();
  if (!body) return;
  const productId = card.dataset.productId;
  commentOpenIds.add(productId);
  try {
    await requestJson(`${API_BASE}/products/${encodeURIComponent(productId)}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    await loadFeed();
    const updatedInput = feedList.querySelector(`[data-product-id="${CSS.escape(productId)}"] input[name="comment"]`);
    updatedInput?.focus();
  } catch (error) {
    showFeedMessage(error.message || "Your comment couldn't be posted.", true);
  }
});

async function signOut(button) {
  button.disabled = true;
  try {
    await initializeFirebase();
    await firebaseSignOut(firebaseAuth);
    clearAuth();
    currentUser = null;
    userLocation = null;
    clearConfirmationPrompt();
    commentOpenIds.clear();
    form.reset();
    setAccountType("buyer");
    setRegistrationMode(false);
    showLogin();
    showMessage("");
  } catch (error) {
    if (!sellerApp.hidden) setSellerNotice(error.message || "Couldn't sign out. Please try again.", true);
    else showFeedMessage(error.message || "Couldn't sign out. Please try again.", true);
  } finally {
    button.disabled = false;
  }
}

signoutButton.addEventListener("click", () => signOut(signoutButton));
sellerSignoutButton.addEventListener("click", () => signOut(sellerSignoutButton));

document.querySelectorAll(".seller-nav-link").forEach((button) => {
  button.addEventListener("click", () => activateSellerTab(button.dataset.sellerTab));
});

productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSellerForm(productForm, `${API_BASE}/seller/products`, async () => {
    await loadSellerDashboard();
    activateSellerTab("products");
    setSellerNotice("Product added to your shop.");
  });
});

sellerProductList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-remove-product]");
  if (!button) return;
  button.disabled = true;
  try {
    await requestJson(`${API_BASE}/seller/products/${encodeURIComponent(button.dataset.removeProduct)}`, { method: "DELETE" });
    await loadSellerDashboard();
    setSellerNotice("Product removed from your shop.");
  } catch (error) {
    setSellerNotice(error.message || "Couldn't remove that product.", true);
    button.disabled = false;
  }
});

workerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSellerForm(workerForm, `${API_BASE}/seller/workers`, async () => {
    await loadSellerDashboard();
    activateSellerTab("team");
    setSellerNotice("Team member added.");
  });
});

workerList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-remove-worker]");
  if (!button) return;
  button.disabled = true;
  try {
    await requestJson(`${API_BASE}/seller/workers/${encodeURIComponent(button.dataset.removeWorker)}`, { method: "DELETE" });
    await loadSellerDashboard();
    activateSellerTab("team");
    setSellerNotice("Team member removed.");
  } catch (error) {
    setSellerNotice(error.message || "Couldn't remove that team member.", true);
    button.disabled = false;
  }
});

shopForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(shopForm).entries());
  values.latitude = Number(values.latitude);
  values.longitude = Number(values.longitude);
  values.delivery_fee = Number(values.delivery_fee);
  submitSellerForm(shopForm, `${API_BASE}/seller/shop`, async () => {
    await loadSellerDashboard();
    activateSellerTab("products");
    setSellerNotice("Shop details saved. Nearby buyers can now discover your products.");
  }, "PUT");
});

document.querySelector("#use-shop-location").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setSellerNotice("Location access isn't available in this browser. Enter your shop coordinates manually.", true);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      document.querySelector("#shop-latitude").value = position.coords.latitude.toFixed(6);
      document.querySelector("#shop-longitude").value = position.coords.longitude.toFixed(6);
      setSellerNotice("Location filled in. Save shop details to publish the location.");
    },
    () => setSellerNotice("Couldn't read your location. Check browser permission or enter coordinates manually.", true),
    { enableHighAccuracy: false, timeout: 12000 }
  );
});

async function restoreSession() {
  try {
    await initializeFirebase();
    const user = await new Promise((resolve, reject) => {
      let unsubscribe;
      unsubscribe = onAuthStateChanged(
        firebaseAuth,
        (signedInUser) => {
          unsubscribe();
          resolve(signedInUser);
        },
        reject
      );
    });
    if (!user) {
      clearAuth();
      return;
    }
    await saveAuth(user);
    const result = await requestJson(`${API_BASE}/auth/session`);
    openAccount(result.user);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      clearAuth();
    }
    showMessage(error.message || "Couldn't restore your account session.");
  }
}

restoreSession();
window.setInterval(() => {
  if (firebaseAuth?.currentUser) void saveAuth(firebaseAuth.currentUser);
}, 45 * 60 * 1000);
const { onRequest } = require("firebase-functions/v2/https");

exports["adistu-api"] = onRequest({ region: "us-central1" }, app);
const { onRequest } = require("firebase-functions/v2/https");

// The export key MUST match "adistu-api" exactly
exports["adistu-api"] = onRequest({ region: "us-central1" }, app);

const express = require("express");
const app = express();

// Good: Handles /api/login or matches base path correctly
app.post("/api/login", (req, res) => {
  res.json({ success: true, message: "Logged in" });
});

// OR if using a sub-router:
const router = express.Router();
router.post("/login", (req, res) => { ... });
app.use("/api", router);

