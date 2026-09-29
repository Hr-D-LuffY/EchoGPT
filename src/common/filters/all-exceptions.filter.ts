import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SSE_CONTENT_TYPE, SSE_EVENT_ERROR } from '../constants/sse.constants';
import { formatSseEvent } from '../sse/sse-writer';

interface ErrorBody {
  success: false;
  statusCode: number;
  message: string;
  errors: string[] | null;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, errors } = this.resolveException(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      success: false,
      statusCode,
      message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (response.headersSent) {
      this.writeToOpenStream(response, body);
      return;
    }
    response.status(statusCode).json(body);
  }

  /**
   * A streaming (SSE) response has already committed its 200 status, so
   * the error is delivered as a final `error` event in the same envelope.
   */
  private writeToOpenStream(response: Response, body: ErrorBody): void {
    if (response.writableEnded) {
      return;
    }
    const contentType = String(response.getHeader('Content-Type') ?? '');
    if (contentType.startsWith(SSE_CONTENT_TYPE)) {
      response.write(formatSseEvent({ event: SSE_EVENT_ERROR, data: body }));
    }
    response.end();
  }

  private resolveException(exception: unknown): {
    statusCode: number;
    message: string;
    errors: string[] | null;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { statusCode: status, message: response, errors: null };
      }

      const responseObject = response as {
        message?: string | string[];
        error?: string;
      };
      const rawMessage = responseObject.message ?? exception.message;

      if (Array.isArray(rawMessage)) {
        return {
          statusCode: status,
          message: responseObject.error ?? 'Validation failed',
          errors: rawMessage,
        };
      }

      return { statusCode: status, message: rawMessage, errors: null };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errors: null,
    };
  }
}
