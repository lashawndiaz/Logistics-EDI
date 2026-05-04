# 🚚 Logistics-EDI (Supply Chain Integration)

Yo team! Welcome sa Logistics Module repo natin. Tayo yung magiging tulay para mag-usap yung mga systems ng Suppliers, Manufacturers, Retailers, at ng Hotel. 

Basically, ito yung mga gagawin ng system natin:
* **EDI Payload Processing:** Tayo sasalo ng mga 850, 855, at 856 JSON files.
* **Delivery Status Updates:** Tayo mag-a-update kung ano na status (`STAT-PKUP`, `STAT-RCVD`, `STAT-DLVD`, etc.).
* **Tracking ID Generation:** Gagawa tayo ng auto-generated tracking numbers (`LOG-DATE-ROUTE-CODE-XXXX`).

---

## 🛠️ Tech Stack Natin

### Frontend (Yung makikita sa screen)
*   **Vite & React (JSX):** Mabilis na setup para sa UI natin.
*   **Tailwind CSS & DaisyUI:** Para chill na lang tayo mag-design. Di na natin kailangan mag-code ng mahabang CSS. Lagay lang natin `className="btn btn-primary"`, solid na agad yung button natin. 

### Backend (Yung utak ng system)
*   **Node.js & Express:** Dito natin ilalagay yung logic pang-salo ng API requests mula kina Merwin, Ashlee, at sa iba pang team.

---

## 🏗️ Core Infrastructure (Paki-basa para walang sablay!)

### 1. Docker (Ang ating "Shipping Box")
**Bakit gagamitin:** Para iwas sa linyahang *"Gumagana naman sa laptop ko ah, bakit sa'yo sira?"* 
Naka-kahon na yung buong app dito. Pag ni-run mo 'to sa laptop mo, sure ball na same tayo lahat ng setup. G na g agad mag-code.

### 2. CI/CD Pipeline (Ang ating Bantay)
**Bakit gagamitin:** Bawat push niyo ng code, may bot na magte-test kung magka-crash ba yung app. Pag nag-error, ekis—bawal i-merge. Pag goods, bibigyan ka niya ng green check. Safe ang `main` branch natin!

---

## 🚀 Paano i-run ang Server sa Laptop mo

**Kailangan mo muna ng:** Git Bash, VS Code, at Docker Desktop (dapat bukas si Docker sa background).

1. **I-clone ang Repo:**
   Open Git Bash tapos i-run 'to:
   ```bash
   git clone [https://github.com/your-username/Logistics-EDI.git](https://github.com/your-username/Logistics-EDI.git)
   cd Logistics-EDI
   ```

2. **Buhayin ang System:**
   Sa loob ng VS Code terminal, i-run itong command na 'to:
   ```bash
   docker-compose up --build
   ```
   *(Kung gusto mo na patayin yung server, press `Ctrl + C` lang sa terminal).*

3. **I-check kung okay na:**
   * Frontend: Punta ka sa `http://localhost:5173`
   * Backend: Punta ka sa `http://localhost:3000/api/status`

---

## 🌿 Git Workflow (Paano mag-code nang walang nasisira)

**RULE #1: WAG KAKALIKUTIN ANG `main` BRANCH.** 
Dun lang tayo sa sarili nating branches mag-kalat, haha. Wag mag-edit directly sa `main` para hindi masira yung live project natin. Visual na lang tayo sa VS Code, no need mag-type ng Git commands.

### Step 1: Gawa ka ng Branch mo sa GitHub
1. Punta dito sa repo sa GitHub.com.
2. Click mo yung **`main`** button sa taas.
3. Type mo yung pangalan ng task mo (e.g., `feature/delivery-ui`).
4. Click **Create branch from 'main'**.

### Step 2: Lipat sa Branch mo sa VS Code
1. Open ang VS Code. Punta sa **Source Control** (yung parang branch icon sa kaliwa).
2. Click yung `...` menu sa taas -> **Pull, Push** -> **Fetch** (Para makita ng laptop mo yung bagong branch).
3. Sa pinaka-baba, click mo yung salitang `main`, tapos piliin mo yung branch na ginawa mo.

### Step 3: Mag-Code at mag-Sync
1. Code ka na. Pag tapos na, i-save mo.
2. Punta ulit sa **Source Control** tab.
3. Lagay ka ng short message kung anong ginawa mo.
4. Click mo yung blue na **Commit** button tapos click mo yung **Sync Changes**. Uploaded na yan!

### Step 4: Mag-Pull Request (PR) & Copilot Check
1. Balik sa GitHub.com, may lalabas na green button na **Compare & pull request**. Click mo yun.
2. **COPILOT CHECK:** Bago mo i-submit, paki-pa-review muna kay GitHub Copilot yung code mo kung may mga obvious na sablay o bugs.
3. Pag goods na kay Copilot, i-submit mo na yung PR. 
4. Ako (Lashawn) lang ang may access mag-click ng Merge button para sure na walang palpak na papasok sa `main` branch natin.
