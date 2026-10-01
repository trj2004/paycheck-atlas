(function () {
  'use strict';

  var DATA = window.PAYCHECK_ATLAS;
  var page = document.body.getAttribute('data-page');
  var currentChartMeasure = 'expenses';
  var currentMapMeasure = 'ratio';
  var mapFocusedStateCode = null;
  var mapZoom = 1;
  var latestRows = [];

  var MAP_LAYOUT = {
    WA: [1, 1], ID: [2, 1], MT: [3, 1], ND: [4, 1], MN: [5, 1], WI: [6, 1], MI: [7, 1], NY: [8, 1], VT: [9, 1], NH: [10, 1], ME: [11, 1],
    OR: [1, 2], NV: [2, 2], WY: [3, 2], SD: [4, 2], IA: [5, 2], IL: [6, 2], IN: [7, 2], OH: [8, 2], PA: [9, 2], MA: [10, 2], CT: [11, 2],
    CA: [1, 3], UT: [2, 3], CO: [3, 3], NE: [4, 3], MO: [5, 3], KY: [6, 3], WV: [7, 3], VA: [8, 3], NJ: [9, 3], RI: [10, 3],
    AZ: [1, 4], NM: [2, 4], KS: [3, 4], AR: [4, 4], TN: [5, 4], NC: [6, 4], MD: [7, 4], DE: [8, 4],
    TX: [3, 5], OK: [4, 5], LA: [5, 5], MS: [6, 5], AL: [7, 5], GA: [8, 5], SC: [9, 5], FL: [10, 5],
    AK: [1, 6], HI: [2, 6]
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function money(value) {
    var rounded = Math.round(value);
    var sign = rounded < 0 ? '-' : '';
    return sign + '$' + Math.abs(rounded).toLocaleString('en-US');
  }

  function compactMoney(value) {
    var rounded = Math.round(value);
    var sign = rounded < 0 ? '-' : '';
    var absolute = Math.abs(rounded);
    if (absolute >= 1000000) return sign + '$' + (absolute / 1000000).toFixed(1) + 'm';
    if (absolute >= 1000) return sign + '$' + (absolute / 1000).toFixed(1) + 'k';
    return sign + '$' + absolute.toLocaleString('en-US');
  }

  function signedMoney(value) {
    return (value >= 0 ? '+' : '') + money(value);
  }

  function percent(value) {
    return Math.round(value * 100) + '%';
  }

  function ratio(value) {
    return value.toFixed(2) + '×';
  }

  function findBy(list, key, value) {
    return list.filter(function (item) { return item[key] === value; })[0] || list[0];
  }

  function costYearFactor(year) {
    return 1 + ((2024 - Number(year)) * 0.028);
  }

  function wageYearFactor(year) {
    return 1 - ((2024 - Number(year)) * 0.022);
  }

  function calculate(options) {
    var state = findBy(DATA.states, 'code', options.stateCode || 'TX');
    var career = findBy(DATA.careers, 'id', options.careerId || 'nurse');
    var household = findBy(DATA.households, 'id', options.householdId || 'solo');
    var mode = findBy(DATA.modes, 'id', options.modeId || 'balanced');
    var percentile = DATA.percentiles[options.percentileKey || 'median'];
    var year = Number(options.year || 2024);
    var priceFactor = state.rpp / 100;
    var yearCosts = costYearFactor(year);
    var salary = Number(options.customSalary) > 0
      ? Number(options.customSalary)
      : career.base * state.wage * percentile.multiplier * wageYearFactor(year);

    var housing = state.rent * household.home * yearCosts;
    var food = 460 * household.food * priceFactor * yearCosts;
    var transport = state.transport * household.transport * yearCosts;
    var health = 315 * household.health * priceFactor * yearCosts;
    var childcare = household.childcare ? 1200 * (household.children === 2 ? 1.45 : 1) * priceFactor * yearCosts : 0;
    var utilities = 190 * (household.home * 0.78 + 0.22) * priceFactor * yearCosts;
    var other = 245 * (1 + household.children * 0.3) * priceFactor * yearCosts;
    var discretionary = mode.discretionary * priceFactor * yearCosts;
    var savings = mode.savings;
    var essentials = housing + food + transport + health + childcare + utilities + other;
    var monthlyBudget = essentials + discretionary + savings;
    var takeHome = salary * (1 - state.tax) / 12;
    var leftover = takeHome - monthlyBudget;
    var requiredGross = monthlyBudget * 12 / (1 - state.tax);
    var rows = [
      { key: 'housing', label: 'Housing', value: housing, className: 'housing' },
      { key: 'food', label: 'Food', value: food, className: 'food' },
      { key: 'transport', label: 'Transport', value: transport, className: 'transport' },
      { key: 'health', label: 'Health care', value: health, className: 'health' },
      { key: 'childcare', label: 'Childcare', value: childcare, className: 'childcare' },
      { key: 'utilities', label: 'Utilities', value: utilities, className: 'utilities' },
      { key: 'other', label: 'Other needs', value: other, className: 'other' },
      { key: 'discretionary', label: 'Personal spending', value: discretionary, className: 'other' },
      { key: 'savings', label: 'Savings target', value: savings, className: 'other' }
    ];
    return {
      state: state,
      career: career,
      household: household,
      mode: mode,
      percentile: percentile,
      percentileKey: options.percentileKey || 'median',
      year: year,
      salary: salary,
      customSalary: Number(options.customSalary) > 0 ? Number(options.customSalary) : null,
      takeHome: takeHome,
      essentials: essentials,
      monthlyBudget: monthlyBudget,
      leftover: leftover,
      ratio: takeHome / monthlyBudget,
      requiredGross: requiredGross,
      salaryGap: salary - requiredGross,
      housingShare: housing / essentials,
      priceAdjustedSalary: salary / priceFactor,
      priceFactor: priceFactor,
      rows: rows
    };
  }

  function optionsFromControls() {
    return {
      careerId: $('#career-select').value,
      stateCode: $('#state-select').value,
      year: $('#year-select').value,
      householdId: $('#household-select').value,
      percentileKey: $('#percentile-select').value,
      modeId: $('#mode-select').value,
      customSalary: $('#custom-salary').value
    };
  }

  function selectOptions(select, items, valueKey, labelFn) {
    select.innerHTML = items.map(function (item) {
      var value = item[valueKey];
      return '<option value="' + value + '">' + labelFn(item) + '</option>';
    }).join('');
  }

  function setText(selector, value) {
    var element = $(selector);
    if (element) element.textContent = value;
  }

  function mapValue(item, measure) {
    if (measure === 'leftover') return item.leftover;
    if (measure === 'required') return item.requiredGross;
    if (measure === 'price') return item.state.rpp;
    return item.ratio;
  }

  function mapValueLabel(item, measure) {
    if (measure === 'leftover') return signedMoney(item.leftover);
    if (measure === 'required') return compactMoney(item.requiredGross);
    if (measure === 'price') return item.state.rpp.toFixed(1);
    return ratio(item.ratio);
  }

  function applyMapZoom() {
    var mapSvg = $('#atlas-map svg');
    if (!mapSvg) return;
    mapSvg.style.transformOrigin = '50% 50%';
    mapSvg.style.transform = 'scale(' + mapZoom + ')';
    var zoomValue = $('#map-zoom-value');
    if (zoomValue) zoomValue.textContent = Math.round(mapZoom * 100) + '%';
    var zoomOut = $('#map-zoom-out');
    var zoomIn = $('#map-zoom-in');
    if (zoomOut) zoomOut.disabled = mapZoom <= 0.85;
    if (zoomIn) zoomIn.disabled = mapZoom >= 1.8;
  }

  function setMapZoom(value) {
    mapZoom = clamp(value, 0.85, 1.8);
    applyMapZoom();
  }

  function renderMap(result) {
    var measure = $('#map-measure').value;
    currentMapMeasure = measure;
    var compareCode = $('#compare-state-select').value;
    var scenarios = DATA.states.map(function (state) {
      return calculate({
        careerId: result.career.id,
        stateCode: state.code,
        year: result.year,
        householdId: result.household.id,
        percentileKey: result.percentileKey,
        modeId: result.mode.id,
        customSalary: result.customSalary || ''
      });
    });
    var values = scenarios.map(function (item) { return mapValue(item, measure); });
    var minimum = Math.min.apply(null, values);
    var maximum = Math.max.apply(null, values);
    var span = maximum - minimum || 1;
    var higherIsBetter = measure === 'ratio' || measure === 'leftover';
    var focused = scenarios.filter(function (item) { return item.state.code === (mapFocusedStateCode || result.state.code); })[0] || result;
    var scoreFor = function (item) {
      var raw = (mapValue(item, measure) - minimum) / span;
      var score = higherIsBetter ? raw : 1 - raw;
      return clamp(score, 0, 1);
    };
    var mapHost = $('#atlas-map');
    var mapSvg = mapHost.querySelector('svg');
    if (!mapSvg) {
      mapHost.innerHTML = window.PAYCHECK_ATLAS_MAP || '<div class="map-loading">Map asset unavailable</div>';
      mapSvg = mapHost.querySelector('svg');
    }
    if (mapSvg) {
      mapSvg.classList.add('state-map-inline');
      scenarios.forEach(function (item) {
        var group = document.getElementById(item.state.code);
        if (!group) return;
        var score = scoreFor(item);
        var color = 'hsl(' + Math.round(36 + score * 44) + ', ' + Math.round(76 + score * 10) + '%, ' + Math.round(55 + score * 10) + '%)';
        var active = item.state.code === result.state.code;
        var compare = item.state.code === compareCode;
        var stroke = active ? '#c9f56a' : compare ? '#ff9c63' : '#1b2c36';
        var strokeWidth = active || compare ? '3' : '1.25';
        group.setAttribute('data-map-state', item.state.code);
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', item.state.name + ': ' + mapValueLabel(item, measure));
        group.style.cursor = 'pointer';
        group.onclick = function () {
          mapFocusedStateCode = item.state.code;
          renderMap(result);
        };
        group.onkeydown = function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            mapFocusedStateCode = item.state.code;
            renderMap(result);
          }
        };
        var title = group.querySelector('title');
        if (!title) {
          title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          group.insertBefore(title, group.firstChild);
        }
        title.textContent = item.state.name + ' · ' + mapValueLabel(item, measure);
        group.querySelectorAll('path.boundary').forEach(function (path) {
          path.style.fill = color;
          path.style.stroke = stroke;
          path.style.strokeWidth = strokeWidth;
          path.style.transition = 'fill .25s ease, stroke .2s ease, stroke-width .2s ease';
        });
        group.querySelectorAll('text').forEach(function (label) {
          label.style.pointerEvents = 'none';
        });
      });
      applyMapZoom();
    }
    setText('#map-selected-state', focused.state.name);
    setText('#map-selected-copy', focused.state.name + ' gives this ' + result.career.name + ' scenario ' + mapValueLabel(focused, measure) + ' on the selected map lens.');
    $('#map-selected-detail').innerHTML = [
      ['Take-home / month', money(focused.takeHome), ''],
      ['Modeled budget', money(focused.monthlyBudget), ''],
      ['Leftover / month', signedMoney(focused.leftover), focused.leftover >= 0 ? 'good' : 'tight'],
      ['Salary needed', compactMoney(focused.requiredGross), ''],
      ['Housing share', percent(focused.housingShare), '']
    ].map(function (row) {
      return '<div class=\"map-story-row\"><span>' + row[0] + '</span><strong class=\"' + row[2] + '\">' + row[1] + '</strong></div>';
    }).join('');
    var compareButton = $('#map-compare-button');
    if (compareButton) compareButton.disabled = focused.state.code === compareCode;
  }

  function renderKpis(result) {
    var cards = [
      ['Take-home / month', money(result.takeHome), 'after modeled taxes', '↘'],
      ['Monthly leftover', signedMoney(result.leftover), result.leftover >= 0 ? 'breathing room after the plan' : 'monthly gap to close', result.leftover >= 0 ? '✦' : '△'],
      ['Break-even salary', compactMoney(result.requiredGross), 'gross annual income for this plan', '≈'],
      ['Housing share', percent(result.housingShare), 'of essential expenses', '⌂']
    ];
    $('#dashboard-kpis').innerHTML = cards.map(function (card) {
      return '<article class="kpi-card"><div class="kpi-top"><span>' + card[0] + '</span><span class="kpi-icon">' + card[3] + '</span></div><strong class="kpi-value">' + card[1] + '</strong><span class="kpi-note">' + card[2] + '</span></article>';
    }).join('');
  }

  function renderGauge(result) {
    var coverage = clamp(result.ratio / 2, 0, 1) * 100;
    var gauge = $('#affordability-gauge');
    gauge.style.background = 'conic-gradient(var(--lime) 0 ' + coverage + '%, #29343d ' + coverage + '% 100%)';
    setText('#gauge-value', ratio(result.ratio));
    setText('#gauge-caption', result.leftover >= 0
      ? 'Your take-home pay covers the modeled budget with ' + money(result.leftover) + ' left over.'
      : 'This plan is short by ' + money(Math.abs(result.leftover)) + ' each month.');
  }

  function renderComparison(result, comparison) {
    var card = function (item, primary) {
      return '<div class="compare-card' + (primary ? ' primary' : '') + '"><div class="compare-card-top"><strong>' + item.state.name + '</strong><span class="compare-tag">' + (primary ? 'selected' : 'comparison') + '</span></div><div class="compare-metrics"><div class="compare-metric"><span>Ratio</span><b class="' + (item.ratio >= 1 ? 'good' : '') + '">' + ratio(item.ratio) + '</b></div><div class="compare-metric"><span>Leftover</span><b class="' + (item.leftover >= 0 ? 'good' : '') + '">' + signedMoney(item.leftover) + '</b></div></div></div>';
    };
    $('#compare-cards').innerHTML = card(result, true) + card(comparison, false);
    var difference = result.leftover - comparison.leftover;
    $('#compare-delta').innerHTML = difference >= 0
      ? '<strong>' + result.state.name + '</strong> leaves ' + money(difference) + ' more each month than ' + comparison.state.name + ' under the same scenario.'
      : '<strong>' + comparison.state.name + '</strong> leaves ' + money(Math.abs(difference)) + ' more each month than ' + result.state.name + ' under the same scenario.';
  }

  function renderWaterfall(result) {
    var rows = result.rows.filter(function (item) { return item.value > 0; });
    var max = Math.max.apply(null, rows.map(function (item) { return item.value; }));
    $('#waterfall-chart').innerHTML = rows.map(function (item) {
      var shown = currentChartMeasure === 'expenses'
        ? percent(item.value / result.monthlyBudget)
        : money(item.value);
      var width = currentChartMeasure === 'expenses'
        ? (item.value / result.monthlyBudget) * 100
        : (item.value / max) * 100;
      return '<div class="waterfall-row"><span class="waterfall-label">' + item.label + '</span><div class="waterfall-track"><div class="waterfall-fill ' + item.className + '" style="width:' + width + '%"></div></div><span class="waterfall-value">' + shown + '</span></div>';
    }).join('');
  }

  function renderDrivers(result) {
    var drivers = result.rows.filter(function (item) { return item.key !== 'savings' && item.key !== 'discretionary' && item.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    var maximum = drivers[0] ? drivers[0].value : 1;
    $('#driver-list').innerHTML = drivers.slice(0, 5).map(function (item) {
      return '<div class="driver-row"><span class="driver-label">' + item.label + '</span><span class="driver-value">' + money(item.value) + '</span><div class="driver-meter"><i style="width:' + (item.value / maximum * 100) + '%"></i></div></div>';
    }).join('');
    if (drivers[0]) {
      $('#driver-callout').innerHTML = '<strong>' + drivers[0].label + '</strong> is the largest essential line in this plan at ' + percent(drivers[0].value / result.essentials) + ' of essentials. Try changing household or location to see which driver moves.';
    }
  }

  function renderRanked(result) {
    var measure = $('#rank-measure').value;
    var values = DATA.states.map(function (state) {
      var item = calculate({
        careerId: result.career.id,
        stateCode: state.code,
        year: result.year,
        householdId: result.household.id,
        percentileKey: result.percentileKey,
        modeId: result.mode.id,
        customSalary: result.customSalary || ''
      });
      item.rankValue = measure === 'ratio' ? item.ratio : measure === 'leftover' ? item.leftover : measure === 'salary' ? item.salary : item.state.rpp;
      return item;
    });
    var ascending = measure === 'price';
    values.sort(function (a, b) { return ascending ? a.rankValue - b.rankValue : b.rankValue - a.rankValue; });
    var visible = values.slice(0, 10);
    var min = Math.min.apply(null, visible.map(function (item) { return item.rankValue; }));
    var max = Math.max.apply(null, visible.map(function (item) { return item.rankValue; }));
    var span = max - min || 1;
    var format = measure === 'ratio' ? ratio : measure === 'price' ? function (v) { return v.toFixed(1); } : compactMoney;
    $('#ranked-list').innerHTML = visible.map(function (item, index) {
      var fill = measure === 'price' ? ((max - item.rankValue) / span * 55 + 45) : ((item.rankValue - min) / span * 55 + 45);
      return '<div class="ranked-row"><span class="rank-number">' + String(index + 1).padStart(2, '0') + '</span><span class="rank-name">' + item.state.name + '</span><div class="rank-bar-track"><div class="rank-bar" style="width:' + fill + '%"></div></div><span class="rank-value">' + format(item.rankValue) + '</span></div>';
    }).join('');
  }

  function lineSvg(series, colors, labels) {
    var width = 420;
    var height = 220;
    var all = [];
    series.forEach(function (set) { all = all.concat(set.values); });
    var min = Math.min.apply(null, all);
    var max = Math.max.apply(null, all);
    var span = max - min || 1;
    var points = function (values) {
      return values.map(function (value, index) {
        var x = 18 + (index / (values.length - 1)) * 384;
        var y = 190 - ((value - min) / span) * 155;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
    };
    var grid = [45, 92, 139, 186].map(function (y) {
      return '<line x1="18" y1="' + y + '" x2="402" y2="' + y + '" class="trend-grid-line"></line>';
    }).join('');
    var paths = series.map(function (set, index) {
      var pts = points(set.values);
      var area = '18,190 ' + pts + ' 402,190';
      return '<polygon points="' + area + '" fill="' + colors[index] + '" class="trend-area"></polygon><polyline points="' + pts + '" stroke="' + colors[index] + '" class="trend-path"></polyline>';
    }).join('');
    var endDots = series.map(function (set, index) {
      var x = 402;
      var y = 190 - ((set.values[set.values.length - 1] - min) / span) * 155;
      return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + colors[index] + '"></circle>';
    }).join('');
    return '<svg viewBox="0 0 420 220" role="img" aria-label="' + labels.join(' versus ') + ' trend">' + grid + paths + endDots + '</svg>';
  }

  function renderTrend(result, target) {
    var series = [
      { values: DATA.years.map(function (year) { return calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, customSalary: result.customSalary || '' }).takeHome; }) },
      { values: DATA.years.map(function (year) { return calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, customSalary: result.customSalary || '' }).monthlyBudget; }) }
    ];
    target.innerHTML = lineSvg(series, ['#c9f56a', '#ff9c63'], ['Take-home', 'Budget']);
  }

  function renderTable(result, comparison) {
    var scenarios = [result, comparison];
    var ranked = DATA.states.map(function (state) {
      return calculate({ careerId: result.career.id, stateCode: state.code, year: result.year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, customSalary: result.customSalary || '' });
    }).sort(function (a, b) { return b.ratio - a.ratio; });
    ranked.slice(0, 3).forEach(function (item) {
      if (!scenarios.some(function (existing) { return existing.state.code === item.state.code; })) scenarios.push(item);
    });
    $('#scenario-table tbody').innerHTML = scenarios.map(function (item) {
      return '<tr><td><strong>' + item.state.name + '</strong></td><td>' + compactMoney(item.salary) + '</td><td>' + money(item.takeHome) + '</td><td>' + money(item.essentials) + '</td><td class="' + (item.leftover >= 0 ? 'positive' : 'negative') + '">' + signedMoney(item.leftover) + '</td><td>' + ratio(item.ratio) + '</td><td>' + percent(item.housingShare) + '</td></tr>';
    }).join('');
    latestRows = scenarios;
  }

  function renderDashboard() {
    var options = optionsFromControls();
    var result = calculate(options);
    var comparison = calculate({
      careerId: options.careerId,
      stateCode: $('#compare-state-select').value,
      year: options.year,
      householdId: options.householdId,
      percentileKey: options.percentileKey,
      modeId: options.modeId,
      customSalary: options.customSalary
    });
    setText('#active-model-label', result.mode.name);
    setText('#active-model-note', result.mode.description);
    setText('#result-title', result.state.name + ' · ' + result.career.name);
    setText('#result-subtitle', result.household.name + ' · ' + (result.customSalary ? 'Custom salary' : result.percentile.label) + ' · ' + result.year);
    setText('#result-badge', result.leftover >= 0 ? 'SURPLUS' : 'SHORTFALL');
    setText('#leftover-value', signedMoney(result.leftover));
    setText('#leftover-note', result.leftover >= 0 ? 'after the selected model' : 'monthly gap in the selected model');
    setText('#break-even-value', compactMoney(result.requiredGross));
    setText('#housing-share-value', percent(result.housingShare));
    renderKpis(result);
    renderGauge(result);
    if ($('#map-year-scrubber')) $('#map-year-scrubber').value = result.year;
    setText('#map-year-label', String(result.year));
    renderMap(result);
    renderComparison(result, comparison);
    renderWaterfall(result);
    renderDrivers(result);
    renderRanked(result);
    renderTrend(result, $('#dashboard-trend'));
    renderTable(result, comparison);
  }

  function csvDownload() {
    var header = ['Location', 'Salary', 'Take-home / month', 'Essentials / month', 'Leftover / month', 'Ratio', 'Housing share'];
    var lines = [header.join(',')].concat(latestRows.map(function (item) {
      return [item.state.name, Math.round(item.salary), Math.round(item.takeHome), Math.round(item.essentials), Math.round(item.leftover), item.ratio.toFixed(2), percent(item.housingShare)].join(',');
    }));
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'paycheck-atlas-scenario.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function initDashboard() {
    selectOptions($('#career-select'), DATA.careers, 'id', function (item) { return item.name; });
    selectOptions($('#state-select'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#compare-state-select'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#year-select'), DATA.years.slice().reverse().map(function (year) { return { value: year }; }), 'value', function (item) { return String(item.value); });
    selectOptions($('#household-select'), DATA.households, 'id', function (item) { return item.name; });
    selectOptions($('#percentile-select'), Object.keys(DATA.percentiles).map(function (key) { return { id: key, label: DATA.percentiles[key].label }; }), 'id', function (item) { return item.label; });
    selectOptions($('#mode-select'), DATA.modes, 'id', function (item) { return item.name; });
    $('#career-select').value = 'nurse';
    $('#state-select').value = 'TX';
    $('#compare-state-select').value = 'CA';
    $('#year-select').value = '2024';
    $('#household-select').value = 'solo';
    $('#percentile-select').value = 'median';
    $('#mode-select').value = 'balanced';
    $all('#career-select, #state-select, #compare-state-select, #year-select, #household-select, #percentile-select, #mode-select, #custom-salary, #rank-measure').forEach(function (element) {
      element.addEventListener('input', renderDashboard);
      element.addEventListener('change', renderDashboard);
    });
    $('#map-measure').addEventListener('change', renderDashboard);
    $('#map-zoom-out').addEventListener('click', function () { setMapZoom(mapZoom - 0.15); });
    $('#map-zoom-reset').addEventListener('click', function () { setMapZoom(1); });
    $('#map-zoom-in').addEventListener('click', function () { setMapZoom(mapZoom + 0.15); });
    $('#map-year-scrubber').addEventListener('input', function () {
      $('#year-select').value = $('#map-year-scrubber').value;
      renderDashboard();
    });
    $('#map-compare-button').addEventListener('click', function () {
      if (mapFocusedStateCode) {
        $('#compare-state-select').value = mapFocusedStateCode;
        renderDashboard();
      }
    });
    $all('[data-chart-measure]').forEach(function (button) {
      button.addEventListener('click', function () {
        currentChartMeasure = button.getAttribute('data-chart-measure');
        $all('[data-chart-measure]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderDashboard();
      });
    });
    $('#reset-dashboard').addEventListener('click', function () {
      $('#career-select').value = 'nurse';
      $('#state-select').value = 'TX';
      $('#compare-state-select').value = 'CA';
      $('#year-select').value = '2024';
      $('#household-select').value = 'solo';
      $('#percentile-select').value = 'median';
      $('#mode-select').value = 'balanced';
      $('#custom-salary').value = '';
      $('#rank-measure').value = 'ratio';
      renderDashboard();
    });
    $('#download-scenario').addEventListener('click', csvDownload);
    var dialog = $('#assumptions-dialog');
    $('#assumptions-open').addEventListener('click', function () { dialog.showModal(); });
    $('#assumptions-close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    renderDashboard();
  }

  function renderHome() {
    var result = calculate({ careerId: 'nurse', stateCode: 'TX', year: 2024, householdId: 'solo', percentileKey: 'median', modeId: 'balanced' });
    var values = DATA.states.map(function (state) {
      return calculate({ careerId: 'nurse', stateCode: state.code, year: 2024, householdId: 'solo', percentileKey: 'median', modeId: 'balanced' });
    });
    var best = values.slice().sort(function (a, b) { return b.ratio - a.ratio; })[0];
    var worst = values.slice().sort(function (a, b) { return a.ratio - b.ratio; })[0];
    var spread = best.leftover - worst.leftover;
    $('#home-metrics').innerHTML = [
      ['Best modeled ratio', ratio(best.ratio), best.state.name + ' · registered nurse'],
      ['Breathing-room spread', money(spread), 'best vs. tightest state'],
      ['Housing share', percent(result.housingShare), 'of Texas essentials in this scenario'],
      ['States in prototype', String(DATA.states.length), 'same career and household lens']
    ].map(function (card) {
      return '<article class="metric-card"><span class="metric-label">' + card[0] + '</span><strong class="metric-value">' + card[1] + '</strong><span class="metric-note">' + card[2] + '</span></article>';
    }).join('');
    var ranked = values.slice().sort(function (a, b) { return b.ratio - a.ratio; }).slice(0, 5);
    var maxRatio = ranked[0].ratio;
    $('#home-ranking').innerHTML = ranked.map(function (item) {
      return '<div class="state-bar-row"><span class="state-name">' + item.state.name + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (item.ratio / maxRatio * 100) + '%"></div></div><span class="bar-value">' + ratio(item.ratio) + '</span></div>';
    }).join('');
    var flow = result.rows.filter(function (item) { return ['housing', 'food', 'transport'].indexOf(item.key) !== -1; });
    var other = result.monthlyBudget - flow.reduce(function (sum, item) { return sum + item.value; }, 0);
    flow.push({ key: 'other', value: other, className: 'other' });
    $('#home-flow').innerHTML = flow.map(function (item) {
      return '<div class="flow-segment ' + item.className + '" style="width:' + (item.value / result.monthlyBudget * 100) + '%" title="' + item.key + ': ' + money(item.value) + '"></div>';
    }).join('');
    var trend = [
      { values: DATA.years.map(function (year) { return calculate({ careerId: 'nurse', stateCode: 'TX', year: year, householdId: 'solo', percentileKey: 'median', modeId: 'balanced' }).takeHome; }) },
      { values: DATA.years.map(function (year) { return calculate({ careerId: 'nurse', stateCode: 'TX', year: year, householdId: 'solo', percentileKey: 'median', modeId: 'balanced' }).monthlyBudget; }) }
    ];
    $('#home-trend').innerHTML = lineSvg(trend, ['#c9f56a', '#ff9c63'], ['Salary', 'Budget']);
  }

  function renderHomePassport() {
    var careerId = $('#home-career-select').value;
    var stateA = $('#home-state-a').value;
    var stateB = $('#home-state-b').value;
    var scenarioA = calculate({ careerId: careerId, stateCode: stateA, year: 2024, householdId: 'solo', percentileKey: 'median', modeId: 'balanced' });
    var scenarioB = calculate({ careerId: careerId, stateCode: stateB, year: 2024, householdId: 'solo', percentileKey: 'median', modeId: 'balanced' });
    setText('#home-passport-a', '');
    setText('#home-passport-b', '');
    $('#home-passport-a').innerHTML = '<small>' + scenarioA.state.name + '</small><strong>' + signedMoney(scenarioA.leftover) + ' / mo</strong>';
    $('#home-passport-b').innerHTML = '<small>' + scenarioB.state.name + '</small><strong>' + signedMoney(scenarioB.leftover) + ' / mo</strong>';
    var delta = scenarioA.leftover - scenarioB.leftover;
    $('#home-passport-result').innerHTML = '<span>' + scenarioA.career.name + ' · median salary · solo renter</span><strong>' + money(Math.abs(delta)) + ' monthly difference</strong><span class=\"passport-delta\">' + (delta >= 0 ? scenarioA.state.code + ' has more room' : scenarioB.state.code + ' has more room') + '</span>';
  }

  function initHomePassport() {
    selectOptions($('#home-career-select'), DATA.careers, 'id', function (item) { return item.name; });
    selectOptions($('#home-state-a'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#home-state-b'), DATA.states, 'code', function (item) { return item.name; });
    $('#home-career-select').value = 'nurse';
    $('#home-state-a').value = 'TX';
    $('#home-state-b').value = 'CA';
    $all('#home-career-select, #home-state-a, #home-state-b').forEach(function (element) {
      element.addEventListener('change', renderHomePassport);
    });
    renderHomePassport();
  }

  if (page === 'dashboard') initDashboard();
  if (page === 'home') {
    renderHome();
    initHomePassport();
  }
})();
