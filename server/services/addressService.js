import { badRequest } from "../shared/errors.js";
import { COVERAGE_LOCATION_BIAS, COVERAGE_LOCATION_SET } from "../shared/coverageAreas.js";

const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const ADDRESS_VALIDATION_URL = "https://addressvalidation.googleapis.com/v1:validateAddress";

class GoogleMapsProviderError extends Error {
  constructor(message, { statusCode = 0 } = {}) {
    super(message);
    this.name = "GoogleMapsProviderError";
    this.statusCode = statusCode;
  }
}

export class AddressService {
  constructor({ appConfig }) {
    this.apiKey = appConfig.googleMaps.apiKey;
    this.enforceValidation = appConfig.googleMaps.enforceAddressValidation;
    this.allowBasicFallback = appConfig.googleMaps.allowBasicFallback;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async suggest({ input, location }) {
    const cleanInput = String(input || "").trim();
    const cleanLocation = this.validateLocation(location);

    if (cleanInput.length < 3) {
      return { configured: this.isConfigured(), suggestions: [] };
    }

    if (!this.isConfigured()) {
      return { configured: false, suggestions: [] };
    }

    const center = COVERAGE_LOCATION_BIAS[cleanLocation];
    const response = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: `${cleanInput}, ${cleanLocation}, Buenos Aires, Argentina`,
        includedRegionCodes: ["ar"],
        languageCode: "es-419",
        locationBias: center
          ? {
              circle: {
                center,
                radius: 18000,
              },
            }
          : undefined,
      }),
    });

    let payload;
    try {
      payload = await this.readGoogleResponse(response, "No pudimos consultar direcciones en Google.");
    } catch (error) {
      if (this.shouldUseBasicFallback(error)) {
        return { configured: false, fallbackAvailable: true, suggestions: [] };
      }
      throw error;
    }
    const suggestions = (payload.suggestions || [])
      .map((suggestion) => suggestion.placePrediction)
      .filter(Boolean)
      .map((prediction) => ({
        placeId: prediction.placeId,
        label: prediction.text?.text || "",
      }))
      .filter((suggestion) => suggestion.placeId && suggestion.label)
      .slice(0, 6);

    return { configured: true, fallbackAvailable: this.allowBasicFallback, suggestions };
  }

  async validate({ address, location, placeId = "" }) {
    const cleanLocation = this.validateLocation(location);
    const cleanAddress = String(address || "").trim();
    const cleanPlaceId = String(placeId || "").trim();

    if (cleanAddress.length < 6 || !/\d/.test(cleanAddress)) {
      throw badRequest("Ingresa una direccion real con calle y numero.");
    }

    if (!this.isConfigured()) {
      if (this.enforceValidation && !this.allowBasicFallback) {
        throw badRequest("Falta configurar Google Maps para validar direcciones.");
      }
      return this.basicFallback(cleanAddress, cleanLocation);
    }

    try {
      return await this.validateWithAddressValidation({ address: cleanAddress, location: cleanLocation, placeId: cleanPlaceId });
    } catch (error) {
      if (cleanPlaceId) {
        try {
          return await this.validateWithPlaceDetails({ address: cleanAddress, location: cleanLocation, placeId: cleanPlaceId });
        } catch (detailsError) {
          if (this.shouldUseBasicFallback(detailsError)) {
            return this.basicFallback(cleanAddress, cleanLocation, "google_unavailable");
          }
          throw detailsError;
        }
      }
      if (this.shouldUseBasicFallback(error)) {
        return this.basicFallback(cleanAddress, cleanLocation, "google_unavailable");
      }
      throw badRequest("Elegi una direccion sugerida para confirmar calle, numero y localidad.");
    }
  }

  async validateWithAddressValidation({ address, location, placeId }) {
    const response = await fetch(`${ADDRESS_VALIDATION_URL}?key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: {
          regionCode: "AR",
          locality: location,
          administrativeArea: "Buenos Aires",
          addressLines: [address],
        },
      }),
    });

    const payload = await this.readGoogleResponse(response, "No pudimos validar la direccion en Google.");
    const result = payload.result || {};
    const verdict = result.verdict || {};
    const postalAddress = result.address?.postalAddress || {};
    const formattedAddress = result.address?.formattedAddress || postalAddress.addressLines?.join(", ") || address;
    const geocode = result.geocode || {};
    const locationPoint = geocode.location || null;
    const validationGranularity = verdict.validationGranularity || "";
    const geocodeGranularity = verdict.geocodeGranularity || "";
    const hasStreetNumberGranularity =
      ["PREMISE", "PREMISE_PROXIMITY", "SUB_PREMISE"].includes(validationGranularity) ||
      ["PREMISE", "PREMISE_PROXIMITY", "SUB_PREMISE"].includes(geocodeGranularity);
    const valid = Boolean(verdict.addressComplete && hasStreetNumberGranularity);

    if (!valid) {
      throw badRequest("No pudimos verificar esa direccion. Elegi una sugerencia valida o revisa calle y numero.");
    }

    return {
      valid: true,
      provider: "google_address_validation",
      placeId,
      input: address,
      formattedAddress,
      location,
      latitude: locationPoint?.latitude ?? null,
      longitude: locationPoint?.longitude ?? null,
      validationGranularity,
      geocodeGranularity,
      addressComplete: Boolean(verdict.addressComplete),
      validatedAt: new Date().toISOString(),
    };
  }

  async validateWithPlaceDetails({ address, location, placeId }) {
    const response = await fetch(`${PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents,types",
      },
    });
    const payload = await this.readGoogleResponse(response, "No pudimos consultar el detalle de la direccion en Google.");
    const components = payload.addressComponents || [];
    const hasStreetNumber = components.some((component) => component.types?.includes("street_number"));
    const hasRoute = components.some((component) => component.types?.includes("route"));
    const isArgentina = components.some((component) => component.types?.includes("country") && component.shortText === "AR");
    const formattedAddress = payload.formattedAddress || address;
    const matchesCoverage = formattedAddress.toLowerCase().includes(location.toLowerCase());

    if (!hasStreetNumber || !hasRoute || !isArgentina || !matchesCoverage) {
      throw badRequest("Elegi una direccion sugerida que incluya calle, numero y localidad dentro de la zona de cobertura.");
    }

    return {
      valid: true,
      provider: "google_places_details",
      placeId,
      input: address,
      formattedAddress,
      location,
      latitude: payload.location?.latitude ?? null,
      longitude: payload.location?.longitude ?? null,
      validationGranularity: "PLACE_DETAILS",
      geocodeGranularity: "PLACE_DETAILS",
      addressComplete: true,
      validatedAt: new Date().toISOString(),
    };
  }

  validateLocation(location) {
    const cleanLocation = String(location || "").trim();
    if (!COVERAGE_LOCATION_SET.has(cleanLocation)) {
      throw badRequest("La localidad seleccionada no esta dentro de la zona de cobertura.");
    }
    return cleanLocation;
  }

  shouldUseBasicFallback(error) {
    return this.allowBasicFallback && error instanceof GoogleMapsProviderError;
  }

  basicFallback(address, location, reason = "basic_validation") {
    return {
      valid: true,
      provider: "basic_fallback",
      fallbackReason: reason,
      input: address,
      formattedAddress: `${address}, ${location}, Buenos Aires, Argentina`,
      location,
      latitude: null,
      longitude: null,
      validationGranularity: "UNVALIDATED",
      geocodeGranularity: "UNVALIDATED",
      addressComplete: false,
      validatedAt: new Date().toISOString(),
    };
  }

  async readGoogleResponse(response, fallbackMessage) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || fallbackMessage;
      throw new GoogleMapsProviderError(message, { statusCode: response.status });
    }
    return payload;
  }
}
