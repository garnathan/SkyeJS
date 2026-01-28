import { useState, useEffect } from 'react';
import { CalculatorIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { toolsApi } from '../services/api';

function Tools() {
  const [formData, setFormData] = useState({
    uk_price: '',
    co2_emissions: '',
    fuel_type: 'petrol',
    vehicle_age: '0',
    transport_method: 'ferry',
    import_origin: 'gb',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);

  // Fetch exchange rate on mount
  useEffect(() => {
    toolsApi.getExchangeRate()
      .then((res) => setExchangeRate(res.data.gbp_to_eur))
      .catch(() => setExchangeRate(1.17));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCalculate = async () => {
    if (!formData.uk_price || !formData.co2_emissions) {
      setError('UK Price and CO2 emissions are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await toolsApi.calculateVrt(formData);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to calculate VRT');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFormData({
      uk_price: '',
      co2_emissions: '',
      fuel_type: 'petrol',
      vehicle_age: '0',
      transport_method: 'ferry',
      import_origin: 'gb',
    });
    setResult(null);
    setError(null);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        Tools
      </h1>

      {/* VRT Calculator */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
            <CalculatorIcon className="w-5 h-5 text-accent-600 dark:text-accent-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              VRT Calculator
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Calculate total import cost for vehicles from UK to Ireland
            </p>
          </div>
          {exchangeRate && (
            <div className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              Exchange Rate: £1 = €{exchangeRate.toFixed(4)}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <Input
              label="UK Purchase Price (GBP)"
              type="number"
              name="uk_price"
              value={formData.uk_price}
              onChange={handleChange}
              placeholder="e.g., 15000"
            />

            <Input
              label="CO2 Emissions (g/km)"
              type="number"
              name="co2_emissions"
              value={formData.co2_emissions}
              onChange={handleChange}
              placeholder="e.g., 120"
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Fuel Type
              </label>
              <select
                name="fuel_type"
                value={formData.fuel_type}
                onChange={handleChange}
                className="input"
              >
                <option value="petrol">Petrol</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybrid</option>
                <option value="electric">Electric</option>
              </select>
            </div>

            <Input
              label="Vehicle Age (years)"
              type="number"
              name="vehicle_age"
              value={formData.vehicle_age}
              onChange={handleChange}
              placeholder="e.g., 3"
              min="0"
              max="20"
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Import Origin
              </label>
              <select
                name="import_origin"
                value={formData.import_origin}
                onChange={handleChange}
                className="input"
              >
                <option value="gb">Great Britain (10% customs duty)</option>
                <option value="ni">Northern Ireland (0% customs duty)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Transport Method
              </label>
              <select
                name="transport_method"
                value={formData.transport_method}
                onChange={handleChange}
                className="input"
              >
                <option value="ferry">Ferry (€300)</option>
                <option value="drive">Drive (€150)</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleCalculate} disabled={loading || !formData.uk_price || !formData.co2_emissions}>
                {loading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" />
                    Calculating...
                  </>
                ) : (
                  'Calculate VRT'
                )}
              </Button>
              <Button variant="secondary" onClick={handleClear}>
                Clear
              </Button>
            </div>
          </div>

          {/* Result */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6">
            {result ? (
              <div className="space-y-4">
                {/* Purchase Details */}
                <div className="pb-4 border-b border-slate-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Purchase Details
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">UK Price:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      £{result.purchase_details.uk_price_gbp.toLocaleString()}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Exchange Rate:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {result.purchase_details.exchange_rate}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Value in EUR:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.purchase_details.vehicle_value_eur)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Origin:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {result.purchase_details.import_origin}
                    </span>
                  </div>
                </div>

                {/* Transport Costs */}
                <div className="pb-4 border-b border-slate-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Transport Costs
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Transport:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.transport_costs.transport)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Insurance (1.5%):</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.transport_costs.insurance)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Customs Clearance:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.transport_costs.customs_clearance)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Total Transport:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.transport_costs.total)}
                    </span>
                  </div>
                </div>

                {/* OMV & Customs */}
                <div className="pb-4 border-b border-slate-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Open Market Value & Customs
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">OMV:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.omv)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Customs Duty {result.customs_duty_applicable ? '(10%)' : '(N/A)'}:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.customs_duty)}
                    </span>
                  </div>
                </div>

                {/* VRT Calculation */}
                <div className="pb-4 border-b border-slate-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    VRT Calculation
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">CO2 Emissions:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {result.vrt_calculation.co2_emissions} g/km
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">VRT Rate:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {result.vrt_calculation.co2_rate_percent}%
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Base VRT:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.vrt_calculation.base_vrt)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Minimum VRT:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.vrt_calculation.minimum_vrt)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Depreciation:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {result.vrt_calculation.depreciation_applied}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Final VRT:</span>
                    <span className="text-accent-500 font-bold">
                      {formatCurrency(result.vrt_calculation.final_vrt)}
                    </span>
                  </div>
                </div>

                {/* VAT */}
                <div className="pb-4 border-b border-slate-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    VAT (21%)
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">VAT Base:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.vat_calculation.vat_base)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">VAT Amount:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.vat_calculation.vat_amount)}
                    </span>
                  </div>
                </div>

                {/* Additional Costs */}
                <div className="pb-4 border-b border-slate-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Additional Costs
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Registration Fee:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formatCurrency(result.additional_costs.registration_fee)}
                    </span>
                  </div>
                </div>

                {/* Total */}
                <div className="pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                      Total Import Cost
                    </span>
                    <span className="text-2xl font-bold text-accent-500">
                      {formatCurrency(result.total_import_cost)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center py-12">
                <div>
                  <CalculatorIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500 dark:text-slate-400">
                    Enter vehicle details to calculate the total import cost
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <p className="mb-2">
            <strong>Cost Breakdown Includes:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Vehicle value converted from GBP to EUR at current exchange rate</li>
            <li>Transport costs (ferry/drive), transit insurance (1.5%), and customs clearance (€50)</li>
            <li>Customs duty (10% for GB imports, 0% for NI imports)</li>
            <li>VRT based on CO2 emissions with age depreciation (2% per year, max 10%)</li>
            <li>VAT at 21% on vehicle value + customs duty + VRT</li>
            <li>Registration fee (€102)</li>
          </ul>
          <p className="mt-2 text-xs">
            <strong>Note:</strong> This is an estimate. Actual costs may vary. Consult Revenue.ie for official calculations.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Tools;
