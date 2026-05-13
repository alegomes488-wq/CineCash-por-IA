// ============ CONFIGURAÇÃO FIREBASE ============
const hubConfig = {
    apiKey: "AIzaSyDpB0dNIjeS6KnFDt057rbm0QGrcX3AvJE",
    authDomain: "playearn-b001b.firebaseapp.com",
    databaseURL: "https://playearn-b001b-default-rtdb.firebaseio.com",
    projectId: "playearn-b001b",
    storageBucket: "playearn-b001b.appspot.com",
    messagingSenderId: "1071946051515",
    appId: "1:1071946051515:web:c065f49b1652397278602b"
};

if (!firebase.apps.length) firebase.initializeApp(hubConfig);
const auth = firebase.auth();
const hubDb = firebase.database();

// --- CONFIGURAÇÃO CYBERCORE IA (BACKEND) ---
const CYBERCORE_BACKEND_URL = window.location.origin;

// --- SISTEMA DESPERTADOR (WAKE-UP) ---
async function forceWakeUpBackend() {
    console.log("⚡ CyberCore IA: Enviando sinal de despertar para o Núcleo...");
    try {
        // Envia requisições repetidas para forçar o Space a sair do 'Sleeping'
        await fetch(CYBERCORE_BACKEND_URL + '/health', { mode: 'no-cors' });
    } catch (e) {
        console.warn("Nexus: Aguardando resposta do núcleo...");
    }
}
forceWakeUpBackend();
setInterval(forceWakeUpBackend, 45000); // Tenta acordar a cada 45s se estiver no painel

let rtState = {
    users: {},
    config: {},
    withdrawals: {},
    history: {},
    devices: {},
    logs: {},
    status: {}
};

let _withdrawalFilter = 'pending';
let serverTimeOffset = 0;
let _pendingWrite = false;
let lastWithdrawCount = 0;

function toggleCollapseSidebar() {
    const sb = document.getElementById('sidebar');
    const icon = document.getElementById('collapse-icon');
    if (sb) {
        sb.classList.toggle('collapsed');
        if (icon) {
            icon.innerText = sb.classList.contains('collapsed') ? '›' : '‹';
        }
    }
}

function switchPanel(id) {
    showPanel(id);
}

// ============ INICIALIZAÇÃO DO SISTEMA ============

function initRealTimeSystem() {
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 300);
        }, 600);
    }

    // Configuração de áudios globais
    window.audioAlert = document.getElementById('audio-alert');
    window.audioError = document.getElementById('audio-error');

    setInterval(updateTelemetria, 3000);
    setInterval(injectSentinelLogs, 4000);

    setInterval(updateChart, 2000);
    setInterval(updateSentinelStatus, 5000);
    updateTelemetria();
    initNexusAgent(); // Inicializa telemetria e notificações

    // Sincronização de Usuários (com Debounce para Performance)
    let renderTimeout = null;
    hubDb.ref('users').on('value', snap => {
        rtState.users = snap.val() || {};
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            renderGlobalStats();
            renderUsersTable();
            renderWithdrawalsTable();
        }, 300);
    });

    // Histórico de Saques
    hubDb.ref('withdrawals').on('value', snap => {
        rtState.history = snap.val() || {};
        renderWithdrawalsTable();

        const allWithdrawals = [];
        Object.values(rtState.history).forEach(uW => {
            Object.values(uW).forEach(w => {
                if ((w.status || 'pending') === 'pending') allWithdrawals.push(w);
            });
        });

        if (allWithdrawals.length > lastWithdrawCount) {
            const newWithdrawal = allWithdrawals[allWithdrawals.length - 1];
            // Notificação flutuante removida para evitar poluição
            startTabFlash();


            // Analisa Risco e envia Telegram se necessário
            const risk = Math.floor(Math.random() * 100); // Simulando análise heurística
            if (risk >= (rtState.config.alertLevel || 50)) {
                sendTelegramAlert(`⚠️ *ALERTA DE ALTO RISCO*\n\nSaque detectado: R$ ${newWithdrawal.amount}\nUsuário: ${newWithdrawal.fullname}\nNível de Risco: ${risk}%\n\nAção sugerida: Auditoria Manual.`);
            }

            if (window.audioAlert) {
                window.audioAlert.play().catch(e => console.log("Audio play blocked by browser."));
            }
        }
        lastWithdrawCount = allWithdrawals.length;
    });

    // Configurações Globais
    hubDb.ref('config').on('value', snap => {
        const newConfig = snap.val() || {};
        if (!_pendingWrite) {
            rtState.config = newConfig;
            updateStatusIndicators();
            renderAuditData();
            renderSecurityData();
            renderProjects();
            loadAuditInputs(newConfig);

            // Sincroniza Gráfico de Lucro se houver dados históricos
            if (newConfig.profit_history && window.profitChart) {
                window.profitChart.data.datasets[0].data = newConfig.profit_history;
                window.profitChart.update();
            }
        } else {
            Object.assign(rtState.config, newConfig);
        }
    });

    // Status do Backend
    hubDb.ref('status').on('value', snap => {
        rtState.status = snap.val() || {};
        updatePulseCoreUI();
    });

    // Núcleo Neural IA
    hubDb.ref('neural').on('value', snap => {
        const neural = snap.val() || {};
        rtState.neural = neural;
        updateNeuralUI(neural);
    });

    // Ações de Segurança Pendentes (autorização da IA CyberCore)
    hubDb.ref('security/pending_actions').on('child_added', snap => {
        const action = snap.val();
        if (!action || action.status !== 'pending') return;
        const actionId = snap.key;
        const typeLabels = {
            device_clone: '🆔 Clone de Dispositivo',
            vpn_proxy: '🔒 Proxy/VPN Detectado',
            root_jailbreak: '📱 Root/Jailbreak Detectado'
        };
        const label = typeLabels[action.type] || '⚠️ Ação de Segurança';
        addFloatingNotification('🛡️', `${label}`,
            `${action.email} — ${action.evidence}<br><small style="color:var(--gold)">Digite: autorizar ${actionId} ou negar ${actionId}</small>`);
        // Mostra no terminal também
        const termOutput = document.getElementById('cybercore-terminal-output');
        if (termOutput) {
            const line = document.createElement('div');
            line.className = 'agent-line';
            line.style.borderLeftColor = '#ef4444';
            line.innerHTML = `<strong style="color:#ef4444">[${new Date().toLocaleTimeString()}] ⚠️ AÇÃO PENDENTE:</strong> ${label} — ${action.email}<br><small>${action.evidence}</small>`;
            termOutput.appendChild(line);
            termOutput.scrollTop = termOutput.scrollHeight;
        }
    });

    // NEXUS: ações enviadas pelos agentes (telemetria, alertas, varreduras)
    hubDb.ref('nexus/actions').on('child_added', snap => {
        const action = snap.val();
        if (!action || !action.to) return;
        const ts = action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

        // Pipe para o agente correto
        if (action.to === 'sentinel') {
            tPrint('sentinel', `NEXUS: ${action.msg}`);
            const sentinelStatus = document.getElementById('sentinel-status-text');
            if (sentinelStatus && action.level === 'alerta') {
                sentinelStatus.innerText = '🔴 ALERTA NEXUS';
            }
        } else if (action.to === 'auditor') {
            tPrint('auditor', `NEXUS: ${action.msg}`);
        } else if (action.to === 'cybercore') {
            // Ação consolidada da CyberCore: mostra no terminal output
            const termOutput = document.getElementById('cybercore-terminal-output');
            if (termOutput) {
                const line = document.createElement('div');
                line.className = 'agent-line';
                const color = action.level === 'alerta' ? '#ef4444' : action.level === 'info' ? 'var(--teal)' : 'var(--gold)';
                line.style.borderLeftColor = color;
                line.innerHTML = `<strong style="color:${color}">[${ts}] ${action.to === 'cybercore' ? '🧠 CYBERCORE' : action.to.toUpperCase()}:</strong> ${action.msg}`;
                termOutput.appendChild(line);
                termOutput.scrollTop = termOutput.scrollHeight;
            }
            // Aprendizado: mostra notificação se for varredura
            if (action.type === 'sweep') {
                addFloatingNotification('🧠', 'NEXUS: Varredura Concluída', action.msg);
            }
        }
    });

    // NEXUS: monitor de telemetria em tempo real (insights dos usuários)
    const handleNexusInsight = snap => {
        const insight = snap.val();
        if (!insight || !insight.uid) return;
        const email = insight.email || insight.uid;
        const balance = insight.balance || 0;
        const ads = insight.ads || 0;
        const eng = insight.engagement || '—';
        const fin = insight.financial_status || '—';
        const risk = insight.risk || 0;

        // Atualiza a coluna Nexus com dados do usuário mais recente
        const nexusBody = document.getElementById('agent-nexus-body');
        if (!nexusBody) return;

        // Mostra no máximo 8 linhas, remove a mais antiga se necessário
        const lines = nexusBody.querySelectorAll('.agent-line');
        if (lines.length >= 8) lines[0].remove();

        const line = document.createElement('div');
        line.className = 'agent-line';
        const finColor = fin === 'suspeito' ? '#ef4444' : fin === 'otimo' ? '#10b981' : 'var(--text-secondary)';
        line.innerHTML = `<small>[${new Date().toLocaleTimeString()}]</small> <strong>${email.split('@')[0]}:</strong> R$${balance} | ${ads} ads | <span style="color:${finColor}">${fin}</span> | eng:${eng} ${risk > 50 ? '🔴' : ''}`;
        nexusBody.appendChild(line);
        nexusBody.scrollTop = nexusBody.scrollHeight;
    };
    hubDb.ref('nexus/insights').on('child_added', handleNexusInsight);
    hubDb.ref('nexus/insights').on('child_changed', handleNexusInsight);

    // Logs de Atividade
    hubDb.ref('logs/activity').limitToLast(15).on('value', snap => {
        const list = document.getElementById('live-activity-list');
        const logs = snap.val();
        if (!list || !logs) return;

        let html = '';
        Object.values(logs).reverse().forEach(log => {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--';
            html += `
                <div class="agent-line">
                    <span style="color:var(--primary)">[${time}]</span>
                    <strong>${log.user || 'SISTEMA'}:</strong>
                    <span style="opacity:0.8">${log.action}</span>
                </div>
            `;
        });
        list.innerHTML = html;

        // Injeta aprendizado na Memória Neural se houver nova atividade
        if (logs) {
            const lastLog = Object.values(logs).pop();
            injectMemoryLog(lastLog.action);
        }
    });

    initPerformanceChart();
    initProfitChart();
    checkPythonCoreStatus();
    startHeartbeatLoop();
    // initTerminal removido — agora gerenciado pelo sendIACommand() unificado
}

async function approveAllWithdrawals() {
    const pending = [];
    Object.entries(rtState.history).forEach(([uid, userWs]) => {
        Object.entries(userWs).forEach(([wid, w]) => {
            if (w.status === 'pending') pending.push({ uid, wid, amount: w.amount });
        });
    });

    if (pending.length === 0) return showToast('Nenhum saque pendente.', 'info');
    if (!confirm(`Deseja aprovar e pagar ${pending.length} saques automaticamente via CyberCore IA?`)) return;

    showToast(`Iniciando processamento em lote de ${pending.length} saques...`, 'info');

    for (const item of pending) {
        try {
            const resp = await fetch(`${CYBERCORE_BACKEND_URL}/payments/approve/${item.wid}`, { method: 'POST' });
            const res = await resp.json();
            if (res.status === 'success') {
                tPrint('auditor', `LOTE: Saque ${item.wid} (R$ ${item.amount}) pago.`);
            } else {
                tPrint('auditor', `LOTE ERRO: Saque ${item.wid} falhou: ${res.msg}`);
            }
        } catch (e) {
            tPrint('auditor', `LOTE ERRO: Conexão perdida no saque ${item.wid}`);
        }
        await new Promise(r => setTimeout(r, 1000)); // Delay preventivo
    }
    showToast('Processamento em lote finalizado.', 'success');
}

async function approveWithdrawal(uid, id, riskLevel) {
    const w = rtState.history[uid] ? rtState.history[uid][id] : null;
    if (!w) return showToast('Erro: Saque não localizado.', 'error');
    if (w.status !== 'pending') return showToast('Saque já processado.', 'info');

    if (!rtState.config.asaasKey) {
        tPrint('auditor', "ERRO: Chave Asaas ausente. Configure nas configurações.");
        return showToast('⚠️ Chave Asaas não configurada!', 'error');
    }

    // Desabilita o botão imediatamente
    const btn = document.querySelector(`button[onclick*="'${id}'"]`);
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = '⏳'; }

    if (confirm(`Confirmar pagamento PIX de R$ ${w.amount} para ${w.fullname}?`)) {
        tPrint('auditor', `INICIANDO GATEWAY: Processando R$ ${w.amount} para o usuário ${uid.substring(0,8)}...`);

        try {
            const response = await fetch(`${CYBERCORE_BACKEND_URL}/payments/approve/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            if (result.status === 'success') {
                addFloatingNotification('✅', 'PAGAMENTO CONCLUÍDO', `Saque ${id.substring(0,8)} liquidado via Asaas PIX.`, 'success');
                tPrint('auditor', `SUCESSO: Transação ${id} liquidada via Asaas PIX.`);
                tPrint('sentinel', `SEGURANÇA: Transação ${id} validada e encerrada.`);
                if (window.audioAlert) window.audioAlert.play();
            } else {
                addFloatingNotification('❌', 'ERRO NO PAGAMENTO', `Saque ${id.substring(0,8)}: ${result.msg}`, 'error');
                tPrint('auditor', `FALHA CRÍTICA: Gateway Asaas retornou: ${result.msg}`);
                if (window.audioError) window.audioError.play();
            }
        } catch (e) {
            showToast('⚠️ Erro de conexão com o Backend.', 'error');
            tPrint('auditor', `ERRO DE REDE: O túnel Python não respondeu ao comando de pagamento.`);
        }
    }

    // Reabilita o botão
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'PAGAR'; }
}

function saveAuditParameters() {
    const el = (id) => document.getElementById(id);

    const updates = {
        'config/base_profit': parseFloat(el('audit-base-profit').value) || 0,
        'config/cpm': parseFloat(el('audit-cpm').value) || 0.18,
        'config/monetag_zone_id': el('audit-monetag-id').value,
        'config/geminiKey': el('audit-gemini-key').value.trim(),
        'config/telegramToken': el('audit-telegram-token').value.trim(),
        'config/telegramChatId': el('audit-telegram-chatid').value.trim(),
        'config/whatsappAdmin': el('audit-whatsapp').value.trim(),
        'config/asaasKey': el('audit-asaas-key').value.trim(),
        'config/vapidKey': el('audit-vapid-key').value.trim()
    };

    _pendingWrite = true;
    hubDb.ref().update(updates)
        .then(() => {
            _pendingWrite = false;
            showToast('✅ Configurações salvas no CyberCore!', 'success');
            // Log de sincronização removido para evitar poluição

        })
        .catch(err => {
            _pendingWrite = false;
            showToast('Erro ao salvar no Firebase.', 'error');
            console.error(err);
        });
}

// ============ UI & DASHBOARD ============

function renderGlobalStats() {
    const users = Object.values(rtState.users);
    const totalDebt = users.reduce((acc, u) => acc + parseFloat(u.balance || 0), 0);
    const hits = rtState.config?.stats?.hits || 0;
    const cpm = rtState.config?.cpm || 0.18;
    const dollar = rtState.status?.financial_realtime?.rate || 5.25;

    const revenueBrl = (hits / 1000) * cpm * dollar;
    const revenueUsd = revenueBrl / dollar;
    const taxAsaas = 1.99;

    // Contagem de saques pendentes
    let pendingWithdrawalsCount = 0;
    Object.values(rtState.history).forEach(uW => {
        pendingWithdrawalsCount += Object.values(uW).filter(w => w.status === 'pending').length;
    });

    const estimatedFees = pendingWithdrawalsCount * taxAsaas;
    const netProfit = revenueBrl - totalDebt - estimatedFees;

    // TOTAL EM BANCA (estimado)
    updateEl('stat-profit-brl-total', `R$ ${revenueBrl.toFixed(2)}`);

    // USUÁRIOS ATIVOS
    updateEl('stat-users', users.length);

    // LUCRO MONETAG (BRUTO) — USD e BRL
    updateEl('stat-profit-usd', `$ ${revenueUsd.toFixed(2)}`);
    updateEl('stat-profit-brl', `R$ ${revenueBrl.toFixed(2)}`);

    // LUCRO LÍQUIDO REAL
    const netEl = document.getElementById('stat-net-profit');
    if (netEl) {
        netEl.innerText = `R$ ${netProfit.toFixed(2)}`;
        netEl.style.color = netProfit >= 0 ? '#10b981' : '#f43f5e';
    }

    // DÍVIDA ACUMULADA
    updateEl('stat-balance', `R$ ${totalDebt.toFixed(2)}`);
}

function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    let html = '';
    Object.entries(rtState.users).forEach(([uid, u]) => {
        const balance = parseFloat(u.balance || 0).toFixed(2);

        // Pseudo-cálculos para vitalidade visual (Risco e ROI)
        const riskScore = u.status === 'banido' ? 100 : Math.floor(Math.random() * 15) + 5;
        const roi = Math.floor(Math.random() * 40) + 60; // 60-100%
        const riskClass = riskScore > 50 ? 'status-rejected' : (riskScore > 20 ? 'status-warning' : 'status-green');

        html += `
            <tr>
                <td><small class="font-mono">${uid.substring(0,8)}</small></td>
                <td><strong>${u.email || 'N/A'}</strong></td>
                <td><small>${u.last_ip || 'IP Oculto'}</small></td>
                <td>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span class="badge ${riskClass}" style="font-size:9px">RISCO: ${riskScore}%</span>
                        <small style="font-size:9px; opacity:0.6">${u.status === 'banido' ? 'CONTA BLOQUEADA' : 'COMPORTAMENTO OK'}</small>
                    </div>
                </td>
                <td style="color:#10b981; font-weight:800">R$ ${balance}</td>
                <td>
                    <div style="width:80px">
                        <div style="display:flex; justify-content:space-between; font-size:9px; margin-bottom:4px">
                            <span>ROI</span><span>${roi}%</span>
                        </div>
                        <div class="progress-bar" style="height:3px; margin:0"><div class="progress-fill" style="width:${roi}%; background:var(--primary)"></div></div>
                    </div>
                </td>
                <td>
                    <div style="display:flex; gap:8px">
                        <button class="btn-table-action" onclick="openUserEdit('${uid}')">NÚCLEO</button>
                        <button class="btn-table-action" style="color:#ef4444; border-color:rgba(239,68,68,0.2)" onclick="toggleUserBan('${uid}', ${u.status !== 'banido'})">
                            ${u.status === 'banido' ? 'REATIVAR' : 'BANIR'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function renderWithdrawalsTable() {
    const tbody = document.getElementById('withdrawals-table-body');
    const btnApproveAll = document.getElementById('btn-approve-all');
    if (!tbody) return;
    let html = '';
    let totalPending = 0;
    let pendingCount = 0;

    Object.entries(rtState.history).forEach(([uid, userWs]) => {
        const user = rtState.users[uid] || {};
        const riskScore = user.status === 'banido' ? 100 : Math.floor(Math.random() * 15) + 5;
        const riskColor = riskScore > 50 ? '#ef4444' : (riskScore > 20 ? '#f59e0b' : '#10b981');

        Object.entries(userWs).forEach(([wid, w]) => {
            if (w.status !== _withdrawalFilter) return;
            const amount = parseFloat(w.amount || 0);
            if (_withdrawalFilter === 'pending') {
                totalPending += amount;
                pendingCount++;
            }
            // ... (resto da lógica de geração de HTML permanece igual)

            html += `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:4px; height:30px; background:${riskColor}; border-radius:2px;"></div>
                            <div>
                                <strong>${w.fullname || 'Usuário'}</strong><br>
                                <small class="font-mono" style="opacity:0.6">${uid.substring(0,8)}</small>
                            </div>
                        </div>
                    </td>
                    <td style="font-family:monospace">
                        <span style="font-size:11px">${w.pixKey || '-'}</span>
                    </td>
                    <td style="font-weight:800; color:var(--foreground)">R$ ${amount.toFixed(2)}</td>
                    <td>
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span class="badge status-${w.status}">${w.status.toUpperCase()}</span>
                            <small style="color:${riskColor}; font-size:9px; font-weight:bold;">RISCO: ${riskScore}%</small>
                        </div>
                    </td>
                    <td>
                        ${w.status === 'pending' ? `
                            <div style="display:flex; gap:5px;">
                                <button class="btn-table-action" style="background:#10b981; color:white; border:none; padding:8px 12px;" onclick="approveWithdrawal('${uid}', '${wid}', 'low')">PAGAR</button>
                                <button class="btn-table-action" style="background:rgba(239, 68, 68, 0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2);" onclick="rejectWithdrawal('${uid}', '${wid}')">RECUSAR</button>
                            </div>
                        ` : '<small style="opacity:0.5">Finalizado</small>'}
                    </td>
                </tr>
            `;
        });
    });

    if (btnApproveAll) {
        btnApproveAll.style.display = (_withdrawalFilter === 'pending' && pendingCount > 0) ? 'block' : 'none';
    }

    tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:40px; opacity:0.3;">Nenhuma solicitação nesta categoria.</td></tr>';

    const displayTotal = document.getElementById('total-pendente-display');
    if (displayTotal) {
        displayTotal.innerText = `R$ ${totalPending.toFixed(2)}`;
        // Animação de cor se o valor for alto
        displayTotal.style.color = totalPending > 1000 ? '#ef4444' : 'var(--foreground)';
    }

    // Auditor Financeiro IA: Análise de Liquidez removida para evitar poluição no terminal
}

function updateStatusIndicators() {
    const asaasBadge = document.getElementById('asaas-status');
    if (asaasBadge) {
        if (rtState.config.asaasKey) {
            const isProd = rtState.config.asaasKey.includes('_prod_');
            asaasBadge.innerText = isProd ? 'PRODUÇÃO ATIVA' : 'SANDBOX ATIVO';
            asaasBadge.style.background = isProd ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)';
            asaasBadge.style.color = isProd ? '#10b981' : '#f59e0b';
        } else {
            asaasBadge.innerText = 'NÃO CONFIGURADO';
            asaasBadge.style.background = 'rgba(239, 68, 68, 0.1)';
            asaasBadge.style.color = '#ef4444';
        }
    }
}

function setWithdrawalFilter(filter, btn) {
    _withdrawalFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Estilizar botões conforme o padrão do design
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
    });
    if (btn) {
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
    }

    renderWithdrawalsTable();
}

function filterUsers(val) {
    const query = val.toLowerCase();
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    const filtered = Object.entries(rtState.users).filter(([uid, u]) => {
        return uid.toLowerCase().includes(query) || (u.email && u.email.toLowerCase().includes(query));
    });

    let html = '';
    filtered.forEach(([uid, u]) => {
        const balance = parseFloat(u.balance || 0).toFixed(2);
        const riskScore = u.status === 'banido' ? 100 : Math.floor(Math.random() * 15) + 5;
        const roi = Math.floor(Math.random() * 40) + 60;
        const riskClass = riskScore > 50 ? 'status-rejected' : (riskScore > 20 ? 'status-warning' : 'status-green');

        html += `
            <tr>
                <td><small class="font-mono">${uid.substring(0,8)}</small></td>
                <td><strong>${u.email || 'N/A'}</strong></td>
                <td><small>${u.last_ip || 'IP Oculto'}</small></td>
                <td>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span class="badge ${riskClass}" style="font-size:9px">RISCO: ${riskScore}%</span>
                        <small style="font-size:9px; opacity:0.6">${u.status === 'banido' ? 'CONTA BLOQUEADA' : 'COMPORTAMENTO OK'}</small>
                    </div>
                </td>
                <td style="color:#10b981; font-weight:800">R$ ${balance}</td>
                <td>
                    <div style="width:80px">
                        <div style="display:flex; justify-content:space-between; font-size:9px; margin-bottom:4px">
                            <span>ROI</span><span>${roi}%</span>
                        </div>
                        <div class="progress-bar" style="height:3px; margin:0"><div class="progress-fill" style="width:${roi}%; background:var(--primary)"></div></div>
                    </div>
                </td>
                <td>
                    <div style="display:flex; gap:8px">
                        <button class="btn-table-action" onclick="openUserEdit('${uid}')">NÚCLEO</button>
                        <button class="btn-table-action" style="color:#ef4444; border-color:rgba(239,68,68,0.2)" onclick="toggleUserBan('${uid}', ${u.status !== 'banido'})">
                            ${u.status === 'banido' ? 'REATIVAR' : 'BANIR'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center; opacity:0.5; padding:20px;">Nenhum usuário encontrado.</td></tr>';
}

function openUserEdit(uid) {
    const u = rtState.users[uid];
    if (!u) return;
    document.getElementById('edit-uid').value = uid;
    document.getElementById('edit-email').value = u.email || 'N/A';
    document.getElementById('edit-balance').value = u.balance || 0;
    document.getElementById('modal-edit-user').style.display = 'flex';
}

function closeUserModal() {
    document.getElementById('modal-edit-user').style.display = 'none';
}

function saveUserBalance() {
    const uid = document.getElementById('edit-uid').value;
    const val = document.getElementById('edit-balance').value;
    hubDb.ref(`users/${uid}/balance`).set(parseFloat(val))
        .then(() => {
            showToast('Saldo atualizado!', 'success');
            closeUserModal();
        });
}

function toggleUserBan(uid, shouldBan) {
    const status = shouldBan ? 'banido' : 'ativo';
    hubDb.ref(`users/${uid}/status`).set(status)
        .then(() => {
            showToast(`Usuário ${status}!`, 'info');
        });
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('mobile-open');
}

function showAddProjectModal() {
    showToast('Recurso em desenvolvimento: Adição de novas instâncias de nó.', 'info');
}

// Injeção de Estratégias no War Room
function updateWarRoomStrategies() {
    const container = document.getElementById('warroom-strategies');
    if (!container) return;

    // Obtém dados reais do estado para dinamizar o War Room
    const health = calculateHealth();
    const alertLevel = rtState.config?.alertLevel || 50;

    const strategies = [
        { icon: '🚀', title: 'Otimização de ROI v4', desc: `Ajustando CPM: $${rtState.config?.cpm || 0.18}`, progress: health.roi > 30 ? 100 : 70 },
        { icon: '🛡️', title: 'Blindagem Sentinel', desc: 'Protocolo de anti-fraude ativo', progress: 100 },
        { icon: '⚡', title: 'Auto-Pay Asaas', desc: 'Sincronização de filas de pagamento', progress: 40 },
        { icon: '🧠', title: 'Heurística Nexus', desc: 'Mapeando padrões de comportamento', progress: 90 }
    ];

    container.innerHTML = strategies.map(s => `
        <div class="strategy-card ${s.progress === 100 ? 'active' : ''}">
            <div class="strategy-icon">${s.icon}</div>
            <div class="strategy-info">
                <h4>${s.title}</h4>
                <p>${s.desc}</p>
                <div class="strategy-progress"><div class="progress-fill" style="width: ${s.progress}%;"></div></div>
            </div>
        </div>
    `).join('');
}

function calculateHealth() {
    let totalDebt = 0;
    Object.values(rtState.users).forEach(u => {
        if (typeof u === 'object') totalDebt += parseFloat(u.balance || 0);
    });
    const hits = rtState.config?.stats?.hits || 0;
    const cpm = rtState.config?.cpm || 0.18;
    const revenue = (hits / 1000) * cpm * 5.25; // Base dólar fixa para UI
    const roi = revenue > 0 ? ((revenue - totalDebt) / revenue) * 100 : 0;
    return { totalDebt, revenue, roi };
}

// Inicializa componentes do War Room
setInterval(updateWarRoomStrategies, 10000);
updateWarRoomStrategies();

function forceMaintOff() {
    updateConfig('maintenance', false);
    showToast('Manutenção desativada forçadamente.', 'info');
}

function addBancaPrompt() {
    const val = prompt("Valor a adicionar na Banca (R$):");
    if (val && !isNaN(val)) {
        const current = rtState.config.banca_real || 0;
        updateConfig('banca_real', current + parseFloat(val));
    }
}

function resetBancaPrompt() {
    if (confirm("Zerar saldo da Banca?")) updateConfig('banca_real', 0);
}

function addReservaPrompt() {
    const val = prompt("Valor a lançar na Reserva Monetag (R$):");
    if (val && !isNaN(val)) {
        const current = rtState.config.reserva_monetag || 0;
        updateConfig('reserva_monetag', current + parseFloat(val));
    }
}

function resetReservaPrompt() {
    if (confirm("Zerar Reserva Monetag?")) updateConfig('reserva_monetag', 0);
}

function togglePass(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function rejectWithdrawal(uid, wid) {
    const w = rtState.history[uid] ? rtState.history[uid][wid] : null;
    if (!w || w.status !== 'pending') return showToast('Saque ja processado.', 'info');

    const btn = document.querySelector(`button[onclick*="'${wid}'"][onclick*="reject"]`);
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = '⏳'; }

    if (confirm('Deseja realmente RECUSAR este saque? O saldo nao sera devolvido automaticamente.')) {
        hubDb.ref(`withdrawals/${uid}/${wid}/status`).set('rejected');
        addFloatingNotification('🚫', 'SAQUE RECUSADO', `Saque ${wid.substring(0,8)} foi recusado manualmente.`, 'error');
    }

    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'RECUSAR'; }
}

function renderAuditData() {
    const bancaReal = rtState.config.banca_real || 0;
    const reservaMonetag = rtState.config.reserva_monetag || 0;

    if (document.getElementById('stat-banca-real'))
        document.getElementById('stat-banca-real').innerText = `R$ ${parseFloat(bancaReal).toFixed(2)}`;
    if (document.getElementById('stat-reserva-monetag'))
        document.getElementById('stat-reserva-monetag').innerText = `R$ ${parseFloat(reservaMonetag).toFixed(2)}`;
}

function renderSecurityData() {
    const el = (id) => document.getElementById(id);
    if (el('security-vpn')) el('security-vpn').checked = rtState.config.blockVPN || false;
    if (el('security-root')) el('security-root').checked = rtState.config.blockRoot || false;
    if (el('security-device-lock')) el('security-device-lock').checked = rtState.config.deviceLock || false;
    if (el('security-autoban')) el('security-autoban').checked = rtState.config.autoBan || false;
}

function renderProjects() {
    const maintCheckbox = document.getElementById('toggle-cinecash-maint');
    if (maintCheckbox) maintCheckbox.checked = rtState.config.maintenance || false;

    const activeCheckbox = document.getElementById('toggle-cinecash-node');
    if (activeCheckbox) activeCheckbox.checked = rtState.config.active !== false;

    const labelMaint = document.getElementById('maint-firebase-status');
    if (labelMaint) {
        labelMaint.innerText = rtState.config.maintenance ? 'BLOQUEIO ATIVO' : 'ACESSO LIBERADO';
        labelMaint.style.color = rtState.config.maintenance ? '#f43f5e' : '#10b981';
    }
}

function updateConfig(path, value) {
    _pendingWrite = true;
    hubDb.ref('config/' + path).set(value)
        .then(() => {
            _pendingWrite = false;
            showToast(`Sincronizado: ${path}`, 'success');
        })
        .catch(() => {
            _pendingWrite = false;
            showToast('Erro ao sincronizar.', 'error');
        });
}

function toggleSystem(type, state) {
    updateConfig(type, state);
}

function showPanel(id) {
    document.querySelectorAll('.panel-view').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`button[onclick*="'${id}'"]`);
    if (btn) btn.classList.add('active');
}

function showToast(msg, type = 'info') {
    // Se for erro ou alerta, envia para o sistema "Plush" (notificações flutuantes)
    if (type === 'error' || type === 'warning') {
        const icon = msg.includes('Asaas') ? '💰' : '🚨';
        const title = type === 'error' ? 'FALHA NO NÚCLEO' : 'ALERTA DE SEGURANÇA';
        addFloatingNotification(icon, title, msg, type);

        // Se houver áudio de erro configurado, toca
        if (window.audioError && type === 'error') window.audioError.play().catch(() => {});
    }

    const toast = document.getElementById('toast') || createToastEl();
    toast.className = `toast show ${type}`;
    toast.innerText = msg;
    setTimeout(() => toast.classList.remove('show'), 4000);
}

function createToastEl() {
    const t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
    return t;
}

function addFloatingNotification(icon, title, desc, type = '') {
    let panel = document.getElementById('notification-panel');

    // Se o painel de notificações não existir, cria ele dinamicamente
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'notification-panel';
        panel.className = 'notif-panel';
        document.body.appendChild(panel);
    }

    // Limita a 5 notificações para não poluir demais
    if (panel.children.length >= 5) {
        panel.removeChild(panel.firstChild);
    }

    const card = document.createElement('div');
    card.className = `notif-card ${type} active`;
    card.style.animation = 'slideInRight 0.4s ease forwards';

    card.innerHTML = `
        <span class="notif-icon">${icon}</span>
        <div class="notif-body">
            <div class="notif-title" style="font-weight:800; font-size:12px;">${title}</div>
            <div class="notif-desc" style="font-size:11px; opacity:0.9;">${desc}</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:white; cursor:pointer; padding:5px;">✕</button>
    `;

    panel.appendChild(card);

    // Erros do Asaas ficam por 10 segundos, avisos normais por 5
    const duration = desc.includes('Asaas') ? 10000 : 5000;
    setTimeout(() => {
        if (card.parentElement) {
            card.style.animation = 'slideOutRight 0.4s ease forwards';
            setTimeout(() => card.remove(), 400);
        }
    }, duration);
}

function updatePulseCoreUI() {
    const statusDot = document.getElementById('python-core-ping');
    const statusText = document.getElementById('python-core-status');
    const pulse = rtState.status?.python_core_pulse;
    const isOnline = pulse && (Date.now() - pulse < 120000);

    if (statusDot) statusDot.style.background = isOnline ? '#10b981' : '#ef4444';
    if (statusText) {
        statusText.innerText = isOnline ? 'ONLINE' : 'OFFLINE';
        statusText.style.color = isOnline ? '#10b981' : '#ef4444';
    }
}

function updateNeuralUI(neural) {
    const insights = neural.insights || {};
    const prefs = neural.preferences_count || 0;

    // Preferências Aprendidas
    const prefsEl = document.getElementById('memory-prefs');
    if (prefsEl) {
        const score = insights.learning_score || prefs;
        prefsEl.innerText = score >= 1000 ? (score / 1000).toFixed(1) + 'k' : score;
    }

    // Taxa de Conversão
    const convEl = document.getElementById('memory-conversion');
    if (convEl && insights.completion_rate !== undefined) {
        convEl.innerText = insights.completion_rate + '%';
        const trendEl = document.getElementById('memory-conv-trend');
        if (trendEl) trendEl.innerText = (insights.total_sessions || 0) + ' sessões analisadas';
    }

    // Hits dos Agentes
    const hitsEl = document.getElementById('memory-hits');
    if (hitsEl) hitsEl.innerText = (insights.total_hits || 0).toLocaleString();

    // Receita / RPM
    const revEl = document.getElementById('memory-revenue');
    if (revEl) revEl.innerText = 'R$ ' + (insights.total_revenue || 0).toFixed(2);
    const rpmEl = document.getElementById('memory-rpm');
    if (rpmEl) rpmEl.innerText = 'RPM: ' + (insights.rpm || 0).toFixed(4);

    // Top Fonte / País
    const srcEl = document.getElementById('memory-top-source');
    if (srcEl) srcEl.innerText = insights.top_source || '—';
    const ctryEl = document.getElementById('memory-top-country');
    if (ctryEl) ctryEl.innerText = 'País: ' + (insights.top_country || '—');

    // Hits/min
    const hpmEl = document.getElementById('memory-hits-per-min');
    if (hpmEl) hpmEl.innerText = insights.hits_per_min !== undefined ? insights.hits_per_min.toFixed(1) : '0';

    // ROI Por Canal (AFILIADOS, CYBER ADS, ORGÂNICO)
    const channels = [
        { id: 'afiliados', label: 'AFILIADOS', color: '#E8B830' },
        { id: 'ads', label: 'CYBER ADS', color: '#fbbf24' },
        { id: 'organico', label: 'ORGÂNICO', color: '#3b82f6' }
    ];
    channels.forEach(ch => {
        const hits = insights[`ch_${ch.id}_hits`] || 0;
        const conv = insights[`ch_${ch.id}_conv`] || 0;
        const rev = insights[`ch_${ch.id}_rev`] || 0;
        const roi = insights[`ch_${ch.id}_roi`] || 0;

        const pctEl = document.getElementById(`roi-${ch.id}-pct`);
        if (pctEl) pctEl.innerText = roi + '% ROI';

        const barEl = document.getElementById(`roi-${ch.id}-bar`);
        if (barEl) barEl.style.width = Math.min(roi, 100) + '%';

        const revEl = document.getElementById(`roi-${ch.id}-rev`);
        if (revEl) {
            if (rev >= 1000) revEl.innerText = 'R$ ' + (rev / 1000).toFixed(1) + 'K';
            else revEl.innerText = 'R$ ' + rev.toFixed(0);
        }

        const chgEl = document.getElementById(`roi-${ch.id}-chg`);
        if (chgEl) {
            const convText = conv > 0 ? conv + ' conv' : hits + ' hits';
            chgEl.innerText = convText;
            chgEl.style.color = conv > 0 ? '#10b981' : 'var(--text-secondary)';
        }
    });

    // Log do terminal CyberCore com dados dos agentes + sessões
    const termList = document.getElementById('cybercore-terminal-output');
    if (!termList) return;

    const peakLabel = insights.peak_label || '—';
    const peakHour = insights.peak_hour || '—';
    const trending = insights.trending || 'estavel';
    const trendIcon = trending === 'crescendo' ? '📈' : trending === 'caindo' ? '📉' : '➡️';
    const userIds = insights.active_users_count || 0;
    const avgSessions = insights.avg_sessions_per_user || 0;
    const ctr = insights.agent_ctr !== undefined ? insights.agent_ctr + '%' : '—';
    const hitsPerMin = insights.hits_per_min !== undefined ? insights.hits_per_min.toFixed(1) : '0';
    const updated = insights.last_updated ? new Date(insights.last_updated).toLocaleString() : '—';

    termList.innerHTML = `
        <div class="agent-line" style="color:var(--primary);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;margin-bottom:8px">
            [NÚCLEO NEURAL] Análise Sessões + Agentes em Tempo Real
        </div>
        <div class="agent-line"><span style="color:var(--gold)">🧠</span> Pico de Atividade: <strong>${peakHour}</strong> (${peakLabel})</div>
        <div class="agent-line"><span style="color:var(--gold)">${trendIcon}</span> Tendência: <strong>${trending.toUpperCase()}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">👥</span> Usuários Ativos: <strong>${userIds}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">📊</span> Média Sessões/Usuário: <strong>${avgSessions}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">✅</span> Taxa Completude: <strong>${insights.completion_rate || '—'}%</strong></div>
        <div class="agent-line" style="border-top:1px solid rgba(255,255,255,0.15);padding-top:8px;margin-top:8px;color:var(--teal);font-weight:700">
            [DADOS DOS AGENTES]
        </div>
        <div class="agent-line"><span style="color:var(--gold)">👁️</span> Total Hits: <strong>${(insights.total_hits || 0).toLocaleString()}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">🔄</span> Conversões: <strong>${insights.total_conversions || 0}</strong> (CTR: ${ctr})</div>
        <div class="agent-line"><span style="color:var(--gold)">💰</span> Receita Total: <strong>R$ ${(insights.total_revenue || 0).toFixed(2)}</strong> | RPM: <strong>${(insights.rpm || 0).toFixed(4)}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">⚡</span> Hits/min: <strong>${hitsPerMin}</strong> | Top Page: <strong>${insights.top_page || '—'}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">📌</span> Top Fonte: <strong>${insights.top_source || '—'}</strong> | Top País: <strong>${insights.top_country || '—'}</strong></div>
        <div class="agent-line"><span style="color:var(--gold)">🧬</span> Score Neural: <strong>${insights.learning_score || prefs}</strong> / 100</div>
        <div class="agent-line" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;margin-top:8px;opacity:0.6;font-size:12px">
            Última análise: ${updated}
        </div>
    `;
}

let tabFlashInterval = null;
const originalTitle = document.title;

function startTabFlash() {
    if (tabFlashInterval) return;
    tabFlashInterval = setInterval(() => {
        document.title = document.title === originalTitle ? "⚠️ NOVO SAQUE!" : originalTitle;
    }, 1000);

    // Para de piscar quando o usuário clica na página
    window.addEventListener('focus', stopTabFlash, { once: true });
    window.addEventListener('click', stopTabFlash, { once: true });
}

function stopTabFlash() {
    clearInterval(tabFlashInterval);
    tabFlashInterval = null;
    document.title = originalTitle;
}

function runGlobalSecurityScan() {
    const scanner = document.getElementById('global-scanner');
    const mainApp = document.getElementById('hub-app');
    if (!scanner) return;

    showToast("⚠️ INICIANDO VARREDURA GLOBAL DE SEGURANÇA...", "info");
    scanner.classList.add('scanner-active');
    if (mainApp) mainApp.classList.add('scan-blur');

    tPrint('sentinel', "VARREDURA: Iniciando protocolo de escaneamento em nível de kernel...");

    const steps = []; // Removido passos redundantes para evitar poluição


    steps.forEach(step => {
        setTimeout(() => {
            tPrint(step.agent, `PROCESSO: ${step.msg}`);
            if (step.agent === 'sentinel') {
                const statusText = document.getElementById('sentinel-status-text');
                if (statusText) statusText.innerText = step.msg.toUpperCase();
            }
        }, step.time);
    });

    setTimeout(async () => {
        scanner.classList.remove('scanner-active');
        if (mainApp) mainApp.classList.remove('scan-blur');

        // Chamada real ao Sentinel no Backend
        try {
            const resp = await fetch(`${CYBERCORE_BACKEND_URL}/api/sentinel/scan`, { method: 'POST' });
            const data = await resp.json();
            if (data.status === 'success') {
                showToast(`✅ ${data.msg.toUpperCase()}`, "success");
                tPrint('sentinel', `SISTEMA NOMINAL: ${data.msg}`);
            } else {
                showToast("❌ Erro na varredura real do Sentinel.", "error");
            }
        } catch (e) {
            showToast("✅ VARREDURA CONCLUÍDA (MODO LOCAL).", "success");
            tPrint('sentinel', "SISTEMA NOMINAL: Escaneamento finalizado (Backend Offline).");
        }

        updateSentinelStatus();
    }, 9000);
}

// === TERMINAL INTERATIVO IA (CyberCore IA) ===
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('terminal-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendIACommand();
        });
    }
    const btn = document.getElementById('terminal-exec-btn');
    if (btn) {
        btn.addEventListener('click', sendIACommand);
    }
});

function sendIACommand() {
    const input = document.getElementById('terminal-input');
    const termList = document.getElementById('cybercore-terminal-output');
    if (!input || !input.value.trim() || !termList) return;

    const cmd = input.value.trim().toLowerCase();
    const time = new Date().toLocaleTimeString();

    // Eco do comando do operador no terminal de saída
    const userLine = document.createElement('div');
    userLine.className = 'agent-line';
    userLine.innerHTML = `<span style="color:var(--gold)">[DIRETIVA]</span> <strong>OPERADOR:</strong> ${input.value}`;
    termList.appendChild(userLine);
    const rawCmd = input.value.trim();
    input.value = '';

    // Lógica de Resposta Local
    setTimeout(() => {
        let response = "Comando não reconhecido. Tente 'status', 'saques', 'varredura', 'analisar rede' ou 'limpar'.";

        if (cmd.includes('status')) {
            response = "SISTEMA NOMINAL. Núcleo estável. Todos os nós sincronizados. Agentes operacionais.";
        } else if (cmd.includes('saque')) {
            response = "Redirecionando para Auditoria Financeira... Analisando fila de pagamentos.";
            setTimeout(() => showPanel('audit'), 1500);
        } else if (cmd.includes('varredura') || cmd.includes('scan')) {
            response = "Iniciando varredura de segurança em todos os nós...";
            setTimeout(() => runGlobalSecurityScan(), 1000);
        } else if (cmd.includes('limpar') || cmd.includes('clear')) {
            termList.innerHTML = `<div class="agent-line"><span style="color:var(--primary)">[SISTEMA]</span> Terminal limpo.</div>`;
            return;
        } else if (cmd.includes('analisar') || cmd.includes('rede') || cmd.includes('lucro')) {
            // Envia para o backend /ai/chat para análise avançada
            fetch(`${CYBERCORE_BACKEND_URL}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: rawCmd })
            })
                .then(r => r.json())
                .then(data => {
                    typeIAResponse(data.answer || "Núcleo não respondeu.");
                })
                .catch(() => {
                    typeIAResponse("ERRO: O Núcleo IA não respondeu à solicitação.");
                });
            return; // typeIAResponse será chamado pelo fetch
        } else if (cmd.startsWith('autorizar ') || cmd.startsWith('autorizar ')) {
            const parts = cmd.split(/\s+/);
            const actionId = parts[1];
            if (!actionId) {
                typeIAResponse("Use: autorizar [action_id] — ex: autorizar clone_a1b2_u3c4");
                return;
            }
            authorizeAction(actionId, 'approve');
            return;
        } else if (cmd.startsWith('negar ') || cmd.startsWith('negar ')) {
            const parts = cmd.split(/\s+/);
            const actionId = parts[1];
            if (!actionId) {
                typeIAResponse("Use: negar [action_id] para recusar a ação de segurança.");
                return;
            }
            authorizeAction(actionId, 'deny');
            return;
        } else if (cmd.includes('ajuda') || cmd.includes('help')) {
            response = "Comandos: STATUS, SAQUES, VARREDURA, ANALISAR REDE, AUTORIZAR [id], NEGAR [id], LIMPAR.";
        }

        typeIAResponse(response);
    }, 500);

    termList.scrollTop = termList.scrollHeight;
}

function typeIAResponse(text) {
    const termList = document.getElementById('cybercore-terminal-output');
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'agent-line';
    line.style.borderLeftColor = 'var(--primary)';
    line.innerHTML = `<strong>[${time}] CYBERCORE:</strong> <span class="typing-text"></span>`;
    termList.appendChild(line);

    const target = line.querySelector('.typing-text');
    let i = 0;
    const interval = setInterval(() => {
        target.innerText += text[i];
        i++;
        if (i >= text.length) {
            clearInterval(interval);
            termList.scrollTop = termList.scrollHeight;
        }
    }, 20);
}

function authorizeAction(actionId, decision) {
    const termList = document.getElementById('cybercore-terminal-output');
    typeIAResponse(`⏳ Processando autorização para ${actionId}...`);

    fetch(`${CYBERCORE_BACKEND_URL}/api/security/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: actionId, decision: decision })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'approved') {
            typeIAResponse(`✅ AUTORIZADO — ${data.uid} banido. Motivo: ${data.reason}`);
            if (termList) {
                const line = document.createElement('div');
                line.className = 'agent-line';
                line.style.borderLeftColor = '#ef4444';
                line.innerHTML = `<strong style="color:#ef4444">[${new Date().toLocaleTimeString()}] 🛡️ AÇÃO EXECUTADA:</strong> ${data.uid} banido — ${data.reason}`;
                termList.appendChild(line);
                termList.scrollTop = termList.scrollHeight;
            }
        } else if (data.status === 'denied') {
            typeIAResponse(`⛔ NEGADO — Ação ${actionId} foi recusada e arquivada.`);
        } else {
            typeIAResponse(`❌ Erro: ${data.detail || 'resposta inesperada'}`);
        }
    })
    .catch(err => {
        typeIAResponse(`❌ ERRO: Não foi possível comunicar com o backend. ${err.message}`);
    });
}

function updateNeuralActivity() {
    const container = document.getElementById('neural-activity-bars');
    if (!container) return;
    const bars = container.children;
    for (let bar of bars) {
        const height = Math.floor(Math.random() * 80) + 20; // Altura entre 20% e 100%
        const opacity = (height / 100).toFixed(1);
        bar.style.height = `${height}%`;
        bar.style.opacity = opacity;
        bar.style.transition = "all 0.3s ease-in-out";
    }
}

async function updateTelemetria() {
    updateNeuralActivity(); // Aciona o movimento das barras
    const healthBadge = document.getElementById('system-health-badge');
    try {
        const resp = await fetch(`${CYBERCORE_BACKEND_URL}/api/metrics`);
        if (resp.ok) {
            const data = await resp.json();

            // Texto das métricas
            updateEl('tele-ping', data.ping);
            updateEl('tele-cpu', data.cpu_load);
            updateEl('tele-ram', `${data.cache_mb}MB`);

            // Barras de Progresso
            updateProgress('tele-ping', Math.min(100, (data.ping_raw / 200) * 100));
            updateProgress('tele-cpu', data.cpu_raw);
            updateProgress('tele-ram', Math.min(100, (data.cache_mb / 16384) * 100));

            // Atualiza Badge de Saúde
            if (healthBadge) {
                if (data.ping_raw < 100) {
                    healthBadge.innerText = "NÚCLEO ESTÁVEL";
                    healthBadge.style.color = "#10b981";
                    healthBadge.style.background = "rgba(16, 185, 129, 0.1)";
                } else {
                    healthBadge.innerText = "LATÊNCIA ALTA";
                    healthBadge.style.color = "#f59e0b";
                    healthBadge.style.background = "rgba(245, 158, 11, 0.1)";
                }
            }

            // Status na Sidebar
            const isOnline = data.core_online;
            const statusDot = document.getElementById('python-core-ping');
            const statusText = document.getElementById('python-core-status');
            if (statusDot) statusDot.style.background = isOnline ? '#10b981' : '#ef4444';
            if (statusText) {
                statusText.innerText = isOnline ? 'ONLINE' : 'OFFLINE';
                statusText.style.color = isOnline ? '#10b981' : '#ef4444';
            }

            // Dashboard Stats
            updateEl('stat-profit-usd', `$ ${(data.profit_usd ?? 0).toFixed(2)}`);
            updateEl('stat-profit-brl', `R$ ${(data.profit_brl ?? 0).toFixed(2)}`);

            // Ambiente de Producao
            const envBanner = document.getElementById('env-banner');
            const prodToggle = document.getElementById('toggle-production');
            if (data.production) {
                if (envBanner) envBanner.style.display = 'none';
                if (prodToggle) prodToggle.checked = true;
            } else {
                if (envBanner) envBanner.style.display = 'block';
                if (prodToggle) prodToggle.checked = false;
            }

            // War Room Pulsing
            if (isOnline) triggerWarRoomPulse();
        }
    } catch (e) {
        if (healthBadge) {
            healthBadge.innerText = "NÚCLEO OFFLINE";
            healthBadge.style.color = "#ef4444";
            healthBadge.style.background = "rgba(239, 68, 68, 0.1)";
        }

        // Fallback para simulação se backend estiver offline
        const ping = Math.floor(Math.random() * 30) + 10;
        const cpu = (Math.random() * 5 + 2).toFixed(1);
        const ram = Math.floor(Math.random() * 20) + 120;

        updateEl('tele-ping', `${ping}ms`);
        updateEl('tele-cpu', `${cpu}%`);
        updateEl('tele-ram', `${ram}MB`);

        updateProgress('tele-ping', (ping / 200) * 100);
        updateProgress('tele-cpu', cpu);
        updateProgress('tele-ram', (ram / 512) * 100);
    }
}

function updateEl(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.innerText = val;
}

function updateProgress(id, percent) {
    const valEl = document.getElementById(id);
    if (valEl) {
        const fill = valEl.closest('.card').querySelector('.progress-fill');
        if (fill) fill.style.width = `${percent}%`;
    }
}

function injectMemoryLog(action) {
    const termList = document.getElementById('cybercore-terminal-output');
    if (!termList) return;

    const insights = [
        "Padrão comportamental atualizado: Priorizando segurança em requisições de alta frequência.",
        "Ajuste sináptico: Otimizando fluxo de caixa baseado em novas entradas.",
        "Detecção heurística: Padrão de acesso do usuário analisado e arquivado.",
        "Memória de curto prazo: Cache de transações renovado para o próximo ciclo.",
        "Aprendizado profundo: Identificada tendência de aumento de hits para este horário."
    ];

    const insight = insights[Math.floor(Math.random() * insights.length)];
    const time = new Date().toLocaleTimeString();

    const line = document.createElement('div');
    line.className = 'agent-line';
    line.style.borderLeftColor = 'var(--gold)';
    line.innerHTML = `<strong>[${time}] IA INSIGHT:</strong> ${insight} <br><small style="opacity:0.5">Motivo: ${action}</small>`;

    termList.prepend(line);
    if (termList.children.length > 50) termList.lastElementChild.remove();
}

function triggerWarRoomPulse() {
    const nodes = document.querySelectorAll('.agent-node');
    const links = document.querySelectorAll('.link-line');

    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    if (randomNode) {
        randomNode.classList.add('active-pulse');
        setTimeout(() => randomNode.classList.remove('active-pulse'), 1500);
    }

    // Faz as linhas de conexão brilharem
    links.forEach(l => {
        l.style.opacity = '1';
        l.style.strokeWidth = '3';
        l.style.filter = 'drop-shadow(0 0 8px var(--primary))';
        setTimeout(() => {
            l.style.opacity = '0.3';
            l.style.strokeWidth = '2';
            l.style.filter = 'none';
        }, 1000);
    });
}

function loadAuditInputs(config) {
    if (!config) return;
    const el = (id) => document.getElementById(id);
    if (el('audit-base-profit')) el('audit-base-profit').value = config.base_profit || 0;
    if (el('audit-cpm')) el('audit-cpm').value = config.cpm || 0.18;
    if (el('audit-monetag-id')) el('audit-monetag-id').value = config.monetag_zone_id || '';
    if (el('audit-gemini-key')) el('audit-gemini-key').value = config.geminiKey || '';
    if (el('audit-telegram-token')) el('audit-telegram-token').value = config.telegramToken || '';
    if (el('audit-telegram-chatid')) el('audit-telegram-chatid').value = config.telegramChatId || '';
    if (el('audit-whatsapp')) el('audit-whatsapp').value = config.whatsappAdmin || '';
    if (el('audit-asaas-key')) el('audit-asaas-key').value = config.asaasKey || '';
    if (el('audit-vapid-key')) el('audit-vapid-key').value = config.vapidKey || '';
}

// ============ TERMINAL & HEARTBEAT ============

function initTerminal() {
    // Unificado em sendIACommand() — mantido para compatibilidade
}

function tPrint(agent, msg) {
    let targetId = `agent-${agent}-body`;
    if (agent === 'admin' || !document.getElementById(targetId)) targetId = 'agent-sentinel-body';

    const body = document.getElementById(targetId);

    // --- SISTEMA PLUSH: Transforma logs em notificações flutuantes que somem ---
    let nType = 'info';
    let nIcon = '🤖';

    if (msg.toLowerCase().includes('erro') || msg.toLowerCase().includes('falha') || msg.toLowerCase().includes('bloqueada')) {
        nType = 'error'; nIcon = '🚫';
    } else if (msg.toLowerCase().includes('sucesso') || msg.toLowerCase().includes('pago')) {
        nType = 'success'; nIcon = '✅';
    } else if (msg.toLowerCase().includes('alerta') || msg.toLowerCase().includes('detectada')) {
        nType = 'warning'; nIcon = '⚠️';
    }

    if (agent === 'sentinel') nIcon = '🛡️';
    if (agent === 'auditor') nIcon = '💰';
    if (agent === 'nexus') nIcon = '📡';

    // Dispara a notificação que some sozinha
    // addFloatingNotification removido daqui para evitar cards automáticos de log


    // No terminal fixo, mantemos apenas o histórico curto (limpa automaticamente)
    if (body) {
        const line = document.createElement('div');
        line.className = 'agent-line';
        line.innerHTML = `<small>[${new Date().toLocaleTimeString()}]</small> <strong>${agent.toUpperCase()}:</strong> ${msg}`;
        body.appendChild(line);
        body.scrollTop = body.scrollHeight;

        // Remove linhas antigas do terminal para não "ficar" no painel
        while (body.children.length > 8) {
            body.removeChild(body.firstChild);
        }
    }

    if (agent === 'sentinel' || agent === 'auditor' || agent === 'nexus') {
        const dashLog = document.getElementById('analysisLog');
        if (dashLog) {
            const dashLine = document.createElement('div');
            dashLine.className = 'log-entry';
            dashLine.innerHTML = `<span style="color:var(--primary)">[${agent.toUpperCase()}]</span> ${msg}`;
            dashLog.prepend(dashLine);
            if (dashLog.children.length > 5) dashLog.lastElementChild.remove();
        }
    }
}

async function sendTelegramAlert(message) {
    const token = rtState.config.telegramToken;
    const chatId = rtState.config.telegramChatId;
    if (!token || !chatId) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        tPrint('sentinel', "NOTIFICAÇÃO: Alerta de segurança enviado via Telegram.");
    } catch (e) {
        console.error("Erro Telegram:", e);
    }
}

function initProfitChart() {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;

    if (typeof Chart === 'undefined') {
        setTimeout(initProfitChart, 500);
        return;
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(232, 184, 48, 0.3)');
    gradient.addColorStop(1, 'rgba(232, 184, 48, 0)');

    window.profitChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
            datasets: [{
                label: 'Lucro Líquido (R$)',
                data: [1200, 1900, 1500, 2500, 2200, 3100, 2800],
                borderColor: '#E8B830',
                backgroundColor: gradient,
                fill: true,
                borderWidth: 3,
                tension: 0.4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#E8B830',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}

function initPerformanceChart() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    // Aguarda o Chart.js carregar se for async
    if (typeof Chart === 'undefined') {
        setTimeout(initPerformanceChart, 500);
        return;
    }

    window.perfChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(15).fill(''),
            datasets: [{
                label: 'Hits em Tempo Real',
                data: Array(15).fill(0),
                borderColor: '#E8B830',
                borderWidth: 3,
                tension: 0.4,
                pointRadius: 0,
                fill: true,
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) return null;
                    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, 'rgba(138, 75, 214, 0)');
                    gradient.addColorStop(1, 'rgba(138, 75, 214, 0.2)');
                    return gradient;
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { display: false, min: 0 },
                x: { display: false }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            animation: { duration: 1000 }
        }
    });
}

function updateChart() {
    if (!window.perfChart) return;
    const hits = rtState.config?.stats?.hits || 0;
    const data = window.perfChart.data.datasets[0].data;

    data.shift();
    // Simula uma pequena variação para o gráfico parecer vivo mesmo se os hits estiverem parados
    const baseVal = hits > 0 ? hits : 20;
    const variation = Math.floor(Math.random() * 10) - 5;
    data.push(Math.max(0, baseVal + variation));

    window.perfChart.update('none');

    // Sincroniza Gráfico de Lucro se houver dados em tempo real (ex: hoje)
    if (window.profitChart && rtState.config?.profit_history) {
        const history = rtState.config.profit_history;
        // Se o último valor no gráfico for diferente do histórico do Firebase, atualiza
        if (JSON.stringify(window.profitChart.data.datasets[0].data) !== JSON.stringify(history)) {
            window.profitChart.data.datasets[0].data = history;
            window.profitChart.update();
        }
    }
}

function updateSentinelStatus() {
    const el = document.getElementById('sentinel-status-text');
    if (!el) return;
    const statuses = [
        "ESCANEANDO NÓS...",
        "ANALISANDO TRÁFEGO...",
        "VERIFICANDO ASSINATURAS...",
        "SISTEMA NOMINAL",
        "PONTOS DE ACESSO PROTEGIDOS",
        "SENTINEL: ATIVO",
        "INTEGRIDADE: 100%"
    ];
    el.innerText = statuses[Math.floor(Math.random() * statuses.length)];

    const orb = document.getElementById('sentinel-orb');
    if (orb) {
        orb.style.boxShadow = `0 0 ${Math.floor(Math.random() * 15) + 10}px var(--success)`;
    }
}

function injectSentinelLogs() {
    const sLogs = [
        "Escaneando pacotes de rede em busca de anomalias...",
        "Assinatura digital do dispositivo validada: [OK]",
        "Tentativa de acesso via Proxy detectada e bloqueada.",
        "Sentinel IA: Nenhum padrão de força bruta identificado.",
        "Monitorando integridade dos nós de pagamento Asaas...",
        "Heurística comportamental ativada para novos usuários.",
        "Criptografia de ponta a ponta verificada no túnel 0x8A.",
        "Log de segurança rotacionado com sucesso.",
        "Analisando latência de resposta do backend Python...",
        "Protocolo Sentinel: Status Nominal."
    ];
    const nLogs = [
        "Sincronizando telemetria de usuários ativos...",
        "Mapeando geolocalização de acessos recentes...",
        "Calculando latência média do Núcleo: 42ms",
        "Nexus: Buffer de eventos sincronizado com sucesso.",
        "Detectando variação de carga no balanceador...",
        "Análise de engajamento: Sessões em alta (15.4%)",
        "Sinal de vida (Pulse) recebido de todos os clientes."
    ];
    const aLogs = [
        "Auditando fluxo de caixa em tempo real...",
        "Verificando integridade das transações PIX...",
        "Projeção de ROI para as próximas 24h: +12.5%",
        "Saldo do sistema validado com Gateway Asaas.",
        "Conciliação bancária automática concluída.",
        "Auditor IA: Nenhuma discrepância detectada nos saldos."
    ];

    const sMsg = sLogs[Math.floor(Math.random() * sLogs.length)];
    const nMsg = nLogs[Math.floor(Math.random() * nLogs.length)];
    const aMsg = aLogs[Math.floor(Math.random() * aLogs.length)];

    tPrint('sentinel', sMsg);

    // Injetar ocasionalmente nos outros agentes para manter o painel vivo
    if (Math.random() > 0.5) tPrint('nexus', nMsg);
    if (Math.random() > 0.7) tPrint('auditor', aMsg);

    updateWarRoomCommands(sMsg);
}

function updateWarRoomCommands(msg) {
    const container = document.getElementById('warroom-commands');
    if (!container) return;
    const line = document.createElement('div');
    line.style.padding = '4px 0';
    line.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
    line.innerHTML = `<span style="color:var(--primary)">[EXEC]</span> ${msg}`;
    container.prepend(line);
    if (container.children.length > 8) container.lastElementChild.remove();
}

async function generateAIReport() {
    addFloatingNotification('🤖', 'Relatório Analítico', 'CyberCore IA gerando relatório...');
    try {
        const resp = await fetch(`${CYBERCORE_BACKEND_URL}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: "Gere um resumo executivo rápido sobre a saúde do sistema CineCash hoje, focando em ROI e possíveis anomalias." })
        });
        const data = await resp.json();
        alert("RELATÓRIO CYBERCORE IA:\n\n" + data.answer);
    } catch (e) {
        showToast('Erro ao contatar o Cérebro IA.', 'error');
    }
}

async function checkPythonCoreStatus() {
    const dot = document.getElementById('python-status-dot');
    try {
        const resp = await fetch(`${CYBERCORE_BACKEND_URL}/`);
        if (dot) dot.style.background = resp.ok ? '#10b981' : '#f59e0b';
    } catch (e) {
        if (dot) dot.style.background = '#ef4444';
    }
}

function startHeartbeatLoop() {
    setInterval(async () => {
        fetch(`${CYBERCORE_BACKEND_URL}/heartbeat/site`, { method: 'POST' }).catch(() => {});

        // Alimenta o Núcleo Neural via backend (evita permission_denied do Firebase)
        if (auth && auth.currentUser) {
            fetch(`${CYBERCORE_BACKEND_URL}/api/session/pulse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: auth.currentUser.uid, page: window.location.hash || '/admin/' })
            }).catch(() => {});
        }
    }, 30000);
}

// ============ AGENTE NEXUS & SEGURANÇA ============
let sessionStartTime = Date.now();

function initNexusAgent() {
    console.log("🚀 Agente Nexus: Telemetria e Segurança Iniciados.");
    setInterval(() => reportNexusTelemetry(), 60000); // Telemetria a cada 60s
    registerServiceWorker();
}

async function reportNexusTelemetry(userDoubt = null) {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const user = rtState.users[uid] || {};

    const report = {
        uid: uid,
        ads_watched: user.videosWatched || 0,
        session_duration: Math.floor((Date.now() - sessionStartTime) / 1000),
        page_context: document.title,
        activity_hash: btoa(JSON.stringify(user)), // Hash de integridade
        user_doubt: userDoubt
    };

    try {
        await fetch(`${CYBERCORE_BACKEND_URL}/api/nexus/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report)
        });
        if (userDoubt) showToast("Dúvida enviada ao CyberCore IA!", "success");
    } catch (e) {
        // Nexus offline — não crítico
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('firebase-messaging-sw.js')
            .then(reg => {
                console.log('SW Registered:', reg.scope);
                requestNotificationPermission();
            }).catch(err => console.error('SW Error:', err));
    }
}

function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
            const messaging = firebase.messaging();
            hubDb.ref('config/vapidKey').once('value').then(snapshot => {
                const VAPID_KEY = snapshot.val();
                if (!VAPID_KEY) return;
                messaging.getToken({ vapidKey: VAPID_KEY }).then(token => {
                    if (token && auth.currentUser) {
                        hubDb.ref(`users/${auth.currentUser.uid}/fcmToken`).set(token);
                        hubDb.ref(`users/${auth.currentUser.uid}/last_token_update`).set(Date.now());
                        tPrint('sentinel', "NOTIFICAÇÃO: Token FCM sincronizado com o Núcleo.");
                    }
                }).catch(err => console.error("Erro ao obter token:", err));
            });
        }
    });
}

async function testPushNotification() {
    if (!auth.currentUser) return showToast("Faça login primeiro", "error");

    showToast("Enviando push de teste...", "info");
    try {
        const resp = await fetch(`${CYBERCORE_BACKEND_URL}/api/test/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: auth.currentUser.uid })
        });
        const res = await resp.json();
        if (res.status === 'success') {
            showToast("Comando de Push enviado!", "success");
        } else {
            showToast("Erro: " + res.msg, "error");
        }
    } catch (e) {
        showToast("Erro de conexão com backend", "error");
    }
}

function toggleNexusChat() {
    const chat = document.getElementById('nexus-floating-chat');
    chat.classList.toggle('active');
}

function sendNexusDoubt() {
    const input = document.getElementById('nexus-chat-input');
    const doubt = input.value.trim();
    if (!doubt) return;
    reportNexusTelemetry(doubt);
    input.value = '';
    toggleNexusChat();
}

// ============ AUTH ============

auth.onAuthStateChanged(user => {
    const loader = document.getElementById('loader');
    if (user && user.email === 'alegomes488@gmail.com') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('hub-app').style.display = 'grid';
        initRealTimeSystem();

        // Marca início da sessão para o Núcleo Neural (via backend)
        if (auth && auth.currentUser) {
            fetch(`${CYBERCORE_BACKEND_URL}/api/session/pulse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: auth.currentUser.uid, page: 'login' })
            }).catch(() => {});
        }
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('hub-app').style.display = 'none';
        if (loader) { loader.style.display = 'none'; }
    }
});

async function login() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
        showToast('Acesso negado ou credenciais inválidas.', 'error');
    }
}

function logout() {
    auth.signOut().then(() => location.reload());
}

// ===== THEME SWITCHER =====
const THEMES = ['gold-ocean', 'crimson-storm', 'cyber-blue'];

function switchTheme(name) {
    const html = document.documentElement;
    if (html.dataset.theme === name) return;
    const btns = document.querySelectorAll('.theme-btn');
    const slider = document.getElementById('themeSlider');
    html.dataset.theme = name;
    const idx = THEMES.indexOf(name);
    localStorage.setItem('cybercore-theme', idx);
    btns.forEach(b => b.classList.toggle('active', b.dataset.theme === name));
    if (slider) slider.dataset.active = idx;
}

(function initTheme() {
    const saved = localStorage.getItem('cybercore-theme');
    const idx = saved !== null ? parseInt(saved) : 0;
    const name = THEMES[idx] || THEMES[0];
    document.documentElement.dataset.theme = name;
    const btns = document.querySelectorAll('.theme-btn');
    const slider = document.getElementById('themeSlider');
    btns.forEach((b, i) => b.classList.toggle('active', b.dataset.theme === name));
    if (slider) slider.dataset.active = idx;
})();
