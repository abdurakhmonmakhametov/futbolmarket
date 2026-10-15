// ===== FutbolMarket — hero interactions =====

const jersey = document.getElementById("jersey");

// Pause auto-rotate while the user is dragging the model, resume after
if (jersey) {
    jersey.addEventListener("camera-change", (e) => {
        if (e.detail.source === "user-interaction") {
            jersey.removeAttribute("auto-rotate");
            clearTimeout(jersey._resumeTimer);
            jersey._resumeTimer = setTimeout(() => {
                jersey.setAttribute("auto-rotate", "");
            }, 3000);
        }
    });

    // If the .glb path is wrong, show a friendly hint instead of a blank space
    jersey.addEventListener("error", () => {
        const box = document.createElement("div");
        box.style.cssText =
            "position:absolute;inset:0;display:grid;place-items:center;text-align:center;font-size:14px;color:#5c5c5c;padding:20px;";
        box.textContent =
            "3D model topilmadi — model/clothe3D.glb fayl yo'lini tekshiring.";
        jersey.appendChild(box);
    });
}

// Simple scroll-in animation for the trust bar stats
const stats = document.querySelectorAll(".stat-num");
const animate = (el) => {
    const target = el.textContent;
    const num = parseFloat(target);
    if (isNaN(num)) return;
    const suffix = target.replace(/[0-9.]/g, "");
    const dur = 900;
    const start = performance.now();
    const step = (t) => {
        const p = Math.min((t - start) / dur, 1);
        const val = num * p;
        el.textContent =
            (Number.isInteger(num) ? Math.round(val) : val.toFixed(1)) + suffix;
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
};

const io = new IntersectionObserver(
    (entries) => {
        entries.forEach((en) => {
            if (en.isIntersecting) {
                animate(en.target);
                io.unobserve(en.target);
            }
        });
    },
    { threshold: 0.6 }
);

stats.forEach((s) => io.observe(s));

/* =========================
   LOGIN / REGISTER
========================= */

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");


function showLogin() {

    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

}


function showRegister() {

    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");

    loginTab.classList.remove("active");
    registerTab.classList.add("active");

}


/* =========================
   PASSWORD SHOW / HIDE
========================= */

function togglePassword(inputId, button) {

    const input = document.getElementById(inputId);

    const icon = button.querySelector("i");

    if (input.type === "password") {

        input.type = "text";

        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");

    } else {

        input.type = "password";

        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");

    }
}


/* =========================
   LOGIN
========================= */

function login(event) {

    event.preventDefault();

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("remember").checked;

    if (!email || !password) {
        alert("Iltimos, barcha maydonlarni to‘ldiring!");
        return;
    }

    if (remember) {
        localStorage.setItem("futbolMarketUser", email);
    }

    alert(
        "Xush kelibsiz! ⚽\n\n" +
        "Kirish ma'lumotlari qabul qilindi."
    );

}


/* =========================
   REGISTER
========================= */

function register(event) {

    event.preventDefault();

    const name = document.getElementById("registerName").value;
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;
    const confirm = document.getElementById("confirmPassword").value;


    if (password !== confirm) {

        alert("Parollar bir xil emas!");

        return;
    }


    if (password.length < 6) {

        alert("Parol kamida 6 ta belgidan iborat bo‘lishi kerak!");

        return;
    }


    const user = {
        name: name,
        email: email
    };


    localStorage.setItem(
        "futbolMarketAccount",
        JSON.stringify(user)
    );


    alert(
        "Tabriklaymiz, " +
        name +
        "! 🎉\n\nHisobingiz yaratildi."
    );


    showLogin();

}


/* =========================
   FORGOT PASSWORD
========================= */

function forgotPassword() {

    const email = prompt(
        "Email manzilingizni kiriting:"
    );

    if (!email) return;

    alert(
        email +
        " manziliga parolni tiklash havolasi yuborildi."
    );

}


/* =========================
   SOCIAL LOGIN
========================= */

function socialLogin(provider) {

    alert(
        provider +
        " orqali kirish hozircha demo rejimida."
    );

}


/* =========================
   BACK BUTTON
========================= */

function goBack() {

    if (window.history.length > 1) {

        window.history.back();

    } else {

        alert("Orqaga qaytish");

    }

}


/* =========================
   REMEMBER USER
========================= */

window.addEventListener("DOMContentLoaded", () => {

    const savedUser =
        localStorage.getItem("futbolMarketUser");

    if (savedUser) {

        document.getElementById("loginEmail").value =
            savedUser;

        document.getElementById("remember").checked =
            true;
    }

});
