// Array global que será preenchido a partir do CSV
let eventData = [];
let currentSort = { column: '', direction: '' };

// Referência aos gráficos (para poder recriar depois)
let eventTypeChartInstance = null;
let factoryChartInstance = null;
let monthlyChartInstance = null;

// Configuração do Chart.js para tema escuro
Chart.defaults.color = '#ffffff';
Chart.defaults.borderColor = '#444';

document.addEventListener('DOMContentLoaded', function() {
    // Upload do CSV
    document.getElementById('csvInput').addEventListener('change', handleFileUpload);

    // Botões de filtro
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    document.getElementById('searchTable').addEventListener('input', filterTable);
    document.getElementById('sortOrder').addEventListener('change', sortTable);
    
    // Ordenação por clique no cabeçalho
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            sortByColumn(column);
        });
    });
});

// --------- Cálculos de duração ---------

// Continua retornando a string HH:MM:SS (para a tabela)
function calcularDuracao(inicioStr, recStr) {
    if (!inicioStr || !recStr) return "";

    const inicio = parsearDataBrasil(inicioStr);
    const fim = parsearDataBrasil(recStr);

    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return "";

    let diffMs = fim - inicio;
    if (diffMs < 0) return "";

    const totalSeconds = Math.floor(diffMs / 1000);
    const horas = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutos = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const segundos = String(totalSeconds % 60).padStart(2, '0');

    return `${horas}:${minutos}:${segundos}`;
}

// NOVO: duração em horas (número) para somar em gráficos
function calcularDuracaoHoras(inicioStr, recStr) {
    if (!inicioStr || !recStr) return 0;

    const inicio = parsearDataBrasil(inicioStr);
    const fim = parsearDataBrasil(recStr);

    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return 0;

    let diffMs = fim - inicio;
    if (diffMs <= 0) return 0;

    return diffMs / (1000 * 60 * 60); // horas
}

// Função para parsear datas no formato brasileiro
function parsearDataBrasil(dataStr) {
    if (!dataStr) return new Date(NaN);
    
    // Tentar diferentes formatos de data brasileira
    // Formato: DD/MM/YYYY HH:mm:ss ou DD/MM/YYYY HH:mm
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})[^\d]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
    const match = dataStr.match(regex);
    
    if (match) {
        const [, dia, mes, ano, hora = '0', minuto = '0', segundo = '0'] = match;
        return new Date(ano, mes - 1, dia, hora, minuto, segundo);
    }
    
    // Tentar formato ISO como fallback
    return new Date(dataStr.replace(" ", "T"));
}

// Função para formatar data no padrão brasileiro
function formatarDataBrasil(dataStr) {
    if (!dataStr) return "";
    
    const data = parsearDataBrasil(dataStr);
    if (isNaN(data.getTime())) return dataStr;
    
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    const horas = String(data.getHours()).padStart(2, '0');
    const minutos = String(data.getMinutes()).padStart(2, '0');
    
    return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
}

// Lê o CSV selecionado
function handleFileUpload(event) {
    const file = event.target.files[0];
    const statusEl = document.getElementById('loadStatus');

    if (!file) {
        statusEl.textContent = "Nenhum arquivo selecionado.";
        return;
    }

    statusEl.textContent = "Carregando e processando arquivo...";

    Papa.parse(file, {
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        complete: function(results) {
            // Mapear colunas da planilha para o formato usado no dashboard
            eventData = results.data.map(row => {
                // Lidar com variações de nomes
                const fabrica = row["Fábrica"] || row["Fabrica"] || row["fabrica"] || "";
                const tipoEvento = row["Tipo de Evento"] || row["Tipo evento"] || row["tipo_evento"] || "";
                const evento = row["Evento"] || row["evento"] || "";
                const inicio = row["Horário de Início"] || row["Horario de Início"] || row["Horário de inicio"] || row["Horario de inicio"] || row["inicio"] || "";
                const recuperado = row["Horario Recuperado"] || row["Horário Recuperado"] || row["recuperado"] || "";
                const atuacao = row["Atuação da bateria"] || row["Atuacao da bateria"] || row["atuacao_bateria"] || "";
                const anotacoes = row["Anotações"] || row["Anotacoes"] || row["anotacoes"] || "";

                const duracao = calcularDuracao(inicio, recuperado);
                const duracaoHoras = calcularDuracaoHoras(inicio, recuperado);

                return {
                    fabrica,
                    tipoEvento,
                    evento,
                    inicio: formatarDataBrasil(inicio),
                    recuperado: formatarDataBrasil(recuperado),
                    duracao,
                    duracaoHoras,
                    atuacao_bateria: atuacao,
                    anotacoes,
                    // Guardar a data original para ordenação
                    _inicioOriginal: inicio,
                    _recuperadoOriginal: recuperado
                };
            }).filter(item => item.inicio && item.inicio !== ""); // garante que só registros com início entram

            if (eventData.length === 0) {
                statusEl.textContent = "Nenhum dado válido encontrado no CSV.";
                resetDashboard();
                return;
            }

            statusEl.textContent = `Arquivo carregado com sucesso. Registros: ${eventData.length}`;

            // Inicializar dashboards com os dados
            initializeFilters();
            updateStatistics();
            renderCharts();
            populateTable();
        },
        error: function(error) {
            statusEl.textContent = "Erro ao ler o arquivo: " + error.message;
            console.error(error);
        }
    });
}

function resetDashboard() {
    document.getElementById('totalEvents').textContent = "0";
    document.getElementById('totalHours').textContent = "0";
    document.getElementById('avgHours').textContent = "0";
    document.getElementById('criticalEvents').textContent = "0";
    document.getElementById('eventsTableBody').innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum dado carregado. Faça upload de um arquivo CSV.</td></tr>';
    document.getElementById('sortOrder').value = "";

    // Zerar gráficos se já existirem
    if (eventTypeChartInstance) { 
        eventTypeChartInstance.destroy(); 
        eventTypeChartInstance = null;
    }
    if (factoryChartInstance) { 
        factoryChartInstance.destroy(); 
        factoryChartInstance = null;
    }
    if (monthlyChartInstance) { 
        monthlyChartInstance.destroy(); 
        monthlyChartInstance = null;
    }
}

// Inicializar opções dos filtros
function initializeFilters() {
    const fabricaFilter = document.getElementById('fabricanteFilter');
    const eventoFilter = document.getElementById('eventoFilter');

    fabricaFilter.innerHTML = '<option value="">Todos</option>';
    eventoFilter.innerHTML = '<option value="">Todos</option>';

    const fabricas = [...new Set(eventData.map(item => item.fabrica).filter(Boolean))];
    const eventos = [...new Set(eventData.map(item => item.evento).filter(Boolean))];

    fabricas.forEach(fabrica => {
        const option = document.createElement('option');
        option.value = fabrica;
        option.textContent = fabrica;
        fabricaFilter.appendChild(option);
    });

    eventos.forEach(evento => {
        const option = document.createElement('option');
        option.value = evento;
        option.textContent = evento;
        eventoFilter.appendChild(option);
    });
}

// Atualizar estatísticas
function updateStatistics(data = eventData) {
    if (!data || data.length === 0) {
        resetDashboard();
        return;
    }

    // Total de registros
    const totalEvents = data.length;
    document.getElementById('totalEvents').textContent = totalEvents;

    // Total de horas de atuação
    const totalHours = data.reduce((sum, item) => sum + (item.duracaoHoras || 0), 0);
    document.getElementById('totalHours').textContent = totalHours.toFixed(1);

    // Média de horas por evento
    const avgHours = totalEvents > 0 ? totalHours / totalEvents : 0;
    document.getElementById('avgHours').textContent = avgHours.toFixed(1);

    // Eventos críticos (Falhas)
    const criticalEvents = data.filter(item => item.tipoEvento === 'Falha').length;
    document.getElementById('criticalEvents').textContent = criticalEvents;
}

// Renderizar gráficos
function renderCharts(data = eventData) {
    if (!data || data.length === 0) {
        return;
    }

    // Destruir gráficos antigos se existirem
    if (eventTypeChartInstance) {
        eventTypeChartInstance.destroy();
        eventTypeChartInstance = null;
    }
    if (factoryChartInstance) {
        factoryChartInstance.destroy();
        factoryChartInstance = null;
    }
    if (monthlyChartInstance) {
        monthlyChartInstance.destroy();
        monthlyChartInstance = null;
    }

    // Gráfico de tipos de evento (contagem)
    const eventTypeCtx = document.getElementById('eventTypeChart').getContext('2d');
    const eventTypeCounts = {
        'Aviso': data.filter(item => item.tipoEvento === 'Aviso').length,
        'Falha': data.filter(item => item.tipoEvento === 'Falha').length
    };

    eventTypeChartInstance = new Chart(eventTypeCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(eventTypeCounts),
            datasets: [{
                data: Object.values(eventTypeCounts),
                backgroundColor: ['#bad700', '#e74c3c'],
                borderWidth: 1,
                borderColor: '#2d2d2d'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                }
            }
        }
    });

    // Gráfico de horas de atuação por fábrica
    const factoryCtx = document.getElementById('factoryChart').getContext('2d');
    const factoryDurations = {};

    data.forEach(item => {
        const fab = item.fabrica || "Não informado";
        const h = item.duracaoHoras || 0;
        factoryDurations[fab] = (factoryDurations[fab] || 0) + h;
    });

    const sortedFactories = Object.entries(factoryDurations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // Reduzido para mobile

    factoryChartInstance = new Chart(factoryCtx, {
        type: 'bar',
        data: {
            labels: sortedFactories.map(item => item[0]),
            datasets: [{
                label: 'Horas de atuação',
                data: sortedFactories.map(item => item[1].toFixed(2)),
                backgroundColor: '#bad700',
                borderWidth: 1,
                borderColor: '#2d2d2d'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true,
                    title: { 
                        display: true, 
                        text: 'Horas',
                        color: '#ffffff'
                    },
                    grid: {
                        color: '#444'
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                },
                x: {
                    grid: {
                        color: '#444'
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                }
            }
        }
    });

    // Gráfico mensal em horas
    const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
    const monthlyDurations = {};

    data.forEach(item => {
        if (!item._inicioOriginal) return;
        const dataObj = parsearDataBrasil(item._inicioOriginal);
        if (!isNaN(dataObj.getTime())) {
            const month = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}`;
            monthlyDurations[month] = (monthlyDurations[month] || 0) + (item.duracaoHoras || 0);
        }
    });

    const sortedMonths = Object.entries(monthlyDurations)
        .sort((a, b) => a[0].localeCompare(b[0]));

    monthlyChartInstance = new Chart(monthlyCtx, {
        type: 'line',
        data: {
            labels: sortedMonths.map(item => {
                const [ano, mes] = item[0].split('-');
                return `${mes}/${ano}`;
            }),
            datasets: [{
                label: 'Horas de atuação por mês',
                data: sortedMonths.map(item => item[1].toFixed(2)),
                borderColor: '#bad700',
                backgroundColor: 'rgba(186, 215, 0, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#bad700',
                pointBorderColor: '#2d2d2d',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true,
                    title: { 
                        display: true, 
                        text: 'Horas',
                        color: '#ffffff'
                    },
                    grid: {
                        color: '#444'
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                },
                x: {
                    grid: {
                        color: '#444'
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        font: {
                            size: window.innerWidth < 576 ? 10 : 12
                        }
                    }
                }
            }
        }
    });
}

// Preencher tabela
function populateTable(data = eventData) {
    const tableBody = document.getElementById('eventsTableBody');
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum dado para exibir</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="mobile-hide">${item.fabrica || ""}</td>
            <td>${item.tipoEvento || ""}</td>
            <td class="mobile-hide">${item.evento || ""}</td>
            <td>${item.inicio || ""}</td>
            <td class="mobile-hide">${item.recuperado || ""}</td>
            <td>${item.duracao || ""}</td>
        `;

        tableBody.appendChild(row);
    });

    // Atualizar indicador de ordenação
    updateSortIndicator();
}

// Ordenar tabela
function sortTable() {
    const sortValue = document.getElementById('sortOrder').value;
    
    switch(sortValue) {
        case 'duracao_asc':
            sortByDuracao('asc');
            break;
        case 'duracao_desc':
            sortByDuracao('desc');
            break;
        case 'data_asc':
            sortByData('asc');
            break;
        case 'data_desc':
            sortByData('desc');
            break;
        default:
            // Ordem original
            populateTable(eventData);
            currentSort = { column: '', direction: '' };
            updateSortIndicator();
            break;
    }
}

function sortByDuracao(direction) {
    const sortedData = [...eventData].sort((a, b) => {
        const duracaoA = a.duracaoHoras || 0;
        const duracaoB = b.duracaoHoras || 0;
        return direction === 'asc' ? duracaoA - duracaoB : duracaoB - duracaoA;
    });
    currentSort = { column: 'duracao', direction };
    populateTable(sortedData);
}

function sortByData(direction) {
    const sortedData = [...eventData].sort((a, b) => {
        const dataA = parsearDataBrasil(a._inicioOriginal).getTime();
        const dataB = parsearDataBrasil(b._inicioOriginal).getTime();
        return direction === 'asc' ? dataA - dataB : dataB - dataA;
    });
    currentSort = { column: 'data', direction };
    populateTable(sortedData);
}

function sortByColumn(column) {
    if (currentSort.column === column) {
        // Alternar direção se clicar na mesma coluna
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // Nova coluna, começar com ascendente
        currentSort = { column, direction: 'asc' };
    }

    if (column === 'duracao') {
        sortByDuracao(currentSort.direction);
    }
    // Atualizar o select para refletir a ordenação atual
    document.getElementById('sortOrder').value = 
        currentSort.column === 'duracao' ? 
        `duracao_${currentSort.direction}` : '';
}

function updateSortIndicator() {
    // Remover todas as classes de ordenação
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('asc', 'desc');
    });

    // Adicionar classe ao cabeçalho atual se estiver ordenado
    if (currentSort.column) {
        const currentHeader = document.querySelector(`[data-sort="${currentSort.column}"]`);
        if (currentHeader) {
            currentHeader.classList.add(currentSort.direction);
        }
    }
}

// Aplicar filtros
function applyFilters() {
    if (!eventData || eventData.length === 0) return;

    const fabricaFilter = document.getElementById('fabricanteFilter').value;
    const tipoEventoFilter = document.getElementById('tipoEventoFilter').value;
    const eventoFilter = document.getElementById('eventoFilter').value;
    const dataFilter = document.getElementById('dataFilter').value;

    let filteredData = [...eventData];

    if (fabricaFilter) {
        filteredData = filteredData.filter(item => item.fabrica === fabricaFilter);
    }

    if (tipoEventoFilter) {
        filteredData = filteredData.filter(item => item.tipoEvento === tipoEventoFilter);
    }

    if (eventoFilter) {
        filteredData = filteredData.filter(item => item.evento === eventoFilter);
    }

    if (dataFilter) {
        filteredData = filteredData.filter(item => {
            if (!item._inicioOriginal) return false;
            const itemDate = parsearDataBrasil(item._inicioOriginal);
            const filterDate = new Date(dataFilter);
            return itemDate.toDateString() === filterDate.toDateString();
        });
    }

    updateStatistics(filteredData);
    renderCharts(filteredData);
    populateTable(filteredData);
}

// Resetar filtros
function resetFilters() {
    document.getElementById('fabricanteFilter').value = '';
    document.getElementById('tipoEventoFilter').value = '';
    document.getElementById('eventoFilter').value = '';
    document.getElementById('dataFilter').value = '';
    document.getElementById('sortOrder').value = '';

    currentSort = { column: '', direction: '' };
    updateSortIndicator();

    updateStatistics(eventData);
    renderCharts(eventData);
    populateTable(eventData);
}

// Filtrar tabela por texto
function filterTable() {
    const searchTerm = document.getElementById('searchTable').value.toLowerCase();
    const rows = document.querySelectorAll('#eventsTableBody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Redesenhar gráficos quando a janela for redimensionada
window.addEventListener('resize', function() {
    if (eventData.length > 0) {
        renderCharts();
    }
});