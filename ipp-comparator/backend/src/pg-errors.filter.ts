import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

/** Turns database constraint / trigger errors into clean 4xx responses. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) {
      const body = e.getResponse();
      return res.status(e.getStatus()).json(typeof body === 'string' ? { message: body } : body);
    }
    if (e?.code === 'P0001') return res.status(HttpStatus.CONFLICT).json({ message: e.message }); // trigger exception
    if (e?.code === '23505') return res.status(HttpStatus.CONFLICT).json({ message: 'That record already exists or conflicts with another' });
    if (e?.code === '23503') return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Referenced record does not exist' });
    if (e?.code === '23514' || e?.code === '22P02' || e?.code === '23502') return res.status(HttpStatus.BAD_REQUEST).json({ message: `Invalid value: ${e.message}` });
    console.error(e);
    return res.status(500).json({ message: 'Something went wrong on the server' });
  }
}
