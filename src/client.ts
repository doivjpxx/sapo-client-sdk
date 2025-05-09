import { AuthConfig, OAuthConfig } from './types/auth';
import { ClientConfig } from './types/client';
import { HttpClient } from './core/client';
import { RateLimiter } from './core/rate-limiter';
import { SapoAuth } from './auth/oauth';
import { AuthenticationError } from './errors';
import { Products } from './resources/products';
import { Orders } from './resources/orders';
import { Customers } from './resources/customers';
import { Collections } from './resources/collections';
import { Inventory } from './resources/inventory';
import { PriceRules } from './resources/price-rules';
import { Fulfillments } from './resources/fulfillments';
import { Metafields } from './resources/metafields';
import { Pages } from './resources/pages';
import { Blogs } from './resources/blogs';
import { Webhooks } from './resources/webhooks';
import { Scope } from './types/auth';

/**
 * Main Sapo API client
 * @category Core
 */
export class SapoClient {
  private readonly config: Required<AuthConfig>;
  private readonly auth?: SapoAuth;
  private readonly httpClient: HttpClient;
  private readonly rateLimiter: RateLimiter;

  // Resource handlers
  public readonly products: Products;
  public readonly orders: Orders;
  public readonly customers: Customers;
  public readonly collections: Collections;
  public readonly inventory: Inventory;
  public readonly priceRules: PriceRules;
  public readonly fulfillments: Fulfillments;
  public readonly metafields: Metafields;
  public readonly pages: Pages;
  public readonly blogs: Blogs;
  public readonly webhooks: Webhooks;

  constructor(config: AuthConfig) {
    this.validateConfig(config);
    this.config = this.initializeConfig(config);

    // Initialize OAuth auth only for OAuth configs
    if (this.config.type === 'oauth') {
      this.auth = new SapoAuth(this.config as OAuthConfig);
    }

    this.rateLimiter = new RateLimiter();
    this.httpClient = this.createHttpClient();

    // Initialize resource handlers
    this.products = new Products(this);
    this.orders = new Orders(this);
    this.customers = new Customers(this);
    this.collections = new Collections(this);
    this.inventory = new Inventory(this);
    this.priceRules = new PriceRules(this);
    this.fulfillments = new Fulfillments(this);
    this.metafields = new Metafields(this);
    this.pages = new Pages(this);
    this.blogs = new Blogs(this);
    this.webhooks = new Webhooks(this);
  }

  private validateConfig(config: AuthConfig): void {
    if (!config.store) {
      throw new Error('store is required');
    }

    if (config.type === 'oauth') {
      if (!config.apiKey || !config.secretKey || !config.redirectUri) {
        throw new Error('apiKey, secretKey, and redirectUri are required for OAuth');
      }
    } else {
      if (!config.apiKey || !config.apiSecret) {
        throw new Error('apiKey and apiSecret are required for Private App');
      }
    }
  }

  private initializeConfig(config: AuthConfig): Required<AuthConfig> {
    if (config.type === 'oauth') {
      return {
        type: 'oauth',
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        redirectUri: config.redirectUri,
        store: config.store,
      };
    } else {
      return {
        type: 'private',
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        store: config.store,
      };
    }
  }

  private createHttpClient(): HttpClient {
    const clientConfig: ClientConfig = {
      baseURL: `https://${this.config.store}`,
      timeout: 30000,
      headers: {},
    };

    if (this.config.type === 'private') {
      clientConfig.apiKey = this.config.apiKey;
      clientConfig.apiSecret = this.config.apiSecret;
      clientConfig.baseURL = `https://${this.config.store}`;
    }

    return new HttpClient(clientConfig);
  }

  /**
   * Set access token for authenticated requests
   */
  public setAccessToken(token: string): void {
    this.httpClient.setAccessToken(token);
  }

  /**
   * Set store URL for API requests
   */
  public setStore(store: string): void {
    this.httpClient.updateConfig({
      baseURL: `https://${store}`,
    });
  }

  /**
   * Make a GET request
   */
  public async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    await this.rateLimiter.checkRateLimit();
    const response = await this.httpClient.get<T>(path, { params });
    this.rateLimiter.consumeToken();
    return response.data;
  }

  /**
   * Make a POST request
   */
  public async post<T>(path: string, data?: any): Promise<T> {
    await this.rateLimiter.checkRateLimit();
    const response = await this.httpClient.post<T>(path, data);
    this.rateLimiter.consumeToken();
    return response.data;
  }

  /**
   * Make a PUT request
   */
  public async put<T>(path: string, data?: any): Promise<T> {
    await this.rateLimiter.checkRateLimit();
    const response = await this.httpClient.put<T>(path, data);
    this.rateLimiter.consumeToken();
    return response.data;
  }

  /**
   * Make a DELETE request
   */
  public async delete<T>(path: string, params?: Record<string, any>): Promise<T> {
    await this.rateLimiter.checkRateLimit();
    const response = await this.httpClient.delete<T>(path, { params });
    this.rateLimiter.consumeToken();
    return response.data;
  }

  /**
   * Get OAuth authorization URL
   */
  public getAuthorizationUrl(store: string, scopes: Scope[]): string {
    if (!this.auth) {
      throw new AuthenticationError(
        'OAuth methods not available for private apps',
        'INVALID_AUTH_METHOD'
      );
    }
    return this.auth.getAuthorizationUrl({ store, scopes });
  }

  /**
   * Complete OAuth flow and get access token
   */
  public async completeOAuth(store: string, callbackUrl: string): Promise<string> {
    if (!this.auth) {
      throw new AuthenticationError(
        'OAuth methods not available for private apps',
        'INVALID_AUTH_METHOD'
      );
    }
    const token = await this.auth.completeOAuth(store, callbackUrl);
    this.httpClient.setAccessToken(token.access_token);
    return token.access_token;
  }

  /**
   * Get current rate limit information
   */
  public getRateLimits() {
    return this.rateLimiter.getRateLimits();
  }

  /**
   * Verify webhook HMAC signature
   */
  public verifyWebhookHmac(query: Record<string, string>, hmac: string): boolean {
    if (!this.auth) {
      throw new AuthenticationError(
        'OAuth methods not available for private apps',
        'INVALID_AUTH_METHOD'
      );
    }
    return this.auth.verifyHmac({ query, hmac });
  }
}
