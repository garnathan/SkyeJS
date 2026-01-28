import { Router } from 'express';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// CO2 emission bands with rates and minimums
const CO2_BANDS = [
  { min: 0, max: 50, rate: 7, minimum: 140 },
  { min: 51, max: 80, rate: 9, minimum: 180 },
  { min: 81, max: 85, rate: 9.75, minimum: 195 },
  { min: 86, max: 90, rate: 10.5, minimum: 210 },
  { min: 91, max: 95, rate: 11.25, minimum: 225 },
  { min: 96, max: 100, rate: 12, minimum: 240 },
  { min: 101, max: 105, rate: 12.75, minimum: 255 },
  { min: 106, max: 110, rate: 13.5, minimum: 270 },
  { min: 111, max: 115, rate: 15.25, minimum: 305 },
  { min: 116, max: 120, rate: 16, minimum: 320 },
  { min: 121, max: 125, rate: 16.75, minimum: 335 },
  { min: 126, max: 130, rate: 17.5, minimum: 350 },
  { min: 131, max: 135, rate: 19.25, minimum: 385 },
  { min: 136, max: 140, rate: 20, minimum: 400 },
  { min: 141, max: 145, rate: 21.5, minimum: 430 },
  { min: 146, max: 150, rate: 25, minimum: 500 },
  { min: 151, max: 155, rate: 27.5, minimum: 550 },
  { min: 156, max: 170, rate: 30, minimum: 600 },
  { min: 171, max: 190, rate: 35, minimum: 700 },
  { min: 191, max: Infinity, rate: 41, minimum: 820 },
];

// Get exchange rate from API
async function getExchangeRate() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/GBP', {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      return data.rates?.EUR || 1.17;
    }
  } catch (error) {
    logger.warn('Failed to fetch exchange rate, using default');
  }
  return 1.17; // Default fallback
}

// Calculate VRT
router.post('/vrt-calculate', asyncHandler(async (req, res) => {
  const {
    uk_price,
    co2_emissions,
    fuel_type: _fuel_type = 'petrol',
    vehicle_age = 0,
    transport_method = 'ferry',
    import_origin = 'gb', // 'gb' (Great Britain) or 'ni' (Northern Ireland)
  } = req.body;

  const ukPrice = parseFloat(uk_price);
  const co2 = parseInt(co2_emissions, 10);
  const age = parseInt(vehicle_age, 10) || 0;

  if (!ukPrice || ukPrice <= 0 || !co2 || co2 <= 0) {
    return res.status(400).json({ error: 'Invalid input values. UK price and CO2 emissions are required.' });
  }

  // Get exchange rate
  const exchangeRate = await getExchangeRate();

  // Convert UK price to EUR
  const vehicleValueEur = ukPrice * exchangeRate;

  // Transport costs
  const transportCost = transport_method === 'ferry' ? 300 : 150;
  const insuranceCost = vehicleValueEur * 0.015; // 1.5% of vehicle value
  const customsClearance = 50;
  const totalTransport = transportCost + insuranceCost + customsClearance;

  // OMV (Open Market Value) - vehicle value + transport costs
  const omv = vehicleValueEur + totalTransport;

  // Customs Duty - 10% for Great Britain imports, 0% for Northern Ireland
  const customsDutyApplicable = import_origin === 'gb';
  const customsDuty = customsDutyApplicable ? vehicleValueEur * 0.10 : 0;

  // Find CO2 band
  let co2Rate = 41; // Default to highest
  let vrtMinimum = 820;
  for (const band of CO2_BANDS) {
    if (co2 >= band.min && co2 <= band.max) {
      co2Rate = band.rate;
      vrtMinimum = band.minimum;
      break;
    }
  }

  // Calculate base VRT
  let baseVrt = omv * (co2Rate / 100);

  // Apply age depreciation (2% per year, max 10%)
  if (age > 0) {
    const depreciationRate = Math.min(age * 0.02, 0.10);
    baseVrt = baseVrt * (1 - depreciationRate);
  }

  // Final VRT is the greater of calculated VRT or minimum
  const finalVrt = Math.max(baseVrt, vrtMinimum);

  // VAT calculation (21% on vehicle + customs + VRT)
  const vatBase = vehicleValueEur + customsDuty + finalVrt;
  const vatAmount = vatBase * 0.21;

  // Registration fee
  const registrationFee = 102;

  // Total import cost
  const totalImportCost =
    vehicleValueEur +
    totalTransport +
    customsDuty +
    finalVrt +
    vatAmount +
    registrationFee;

  logger.info(`VRT calculated: ${ukPrice} GBP = ${totalImportCost.toFixed(2)} EUR total`);

  res.json({
    purchase_details: {
      uk_price_gbp: ukPrice,
      exchange_rate: Math.round(exchangeRate * 10000) / 10000,
      vehicle_value_eur: Math.round(vehicleValueEur * 100) / 100,
      import_origin: import_origin.toUpperCase(),
    },
    transport_costs: {
      transport: transportCost,
      insurance: Math.round(insuranceCost * 100) / 100,
      customs_clearance: customsClearance,
      total: Math.round(totalTransport * 100) / 100,
    },
    omv: Math.round(omv * 100) / 100,
    customs_duty: Math.round(customsDuty * 100) / 100,
    customs_duty_applicable: customsDutyApplicable,
    vrt_calculation: {
      co2_emissions: co2,
      co2_rate_percent: co2Rate,
      base_vrt: Math.round(baseVrt * 100) / 100,
      minimum_vrt: vrtMinimum,
      final_vrt: Math.round(finalVrt * 100) / 100,
      vehicle_age: age,
      depreciation_applied: age > 0 ? Math.min(age * 2, 10) + '%' : 'None',
    },
    vat_calculation: {
      vat_base: Math.round(vatBase * 100) / 100,
      vat_rate_percent: 21,
      vat_amount: Math.round(vatAmount * 100) / 100,
    },
    additional_costs: {
      registration_fee: registrationFee,
    },
    total_import_cost: Math.round(totalImportCost * 100) / 100,
  });
}));

// Get current exchange rate
router.get('/exchange-rate', asyncHandler(async (req, res) => {
  const rate = await getExchangeRate();
  res.json({ gbp_to_eur: rate });
}));

export default router;
