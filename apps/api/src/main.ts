import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((value) => value.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  // 生产环境默认不暴露 Swagger；确需开启时设 SWAGGER_ENABLED=1（配合网络层限制访问）
  const swaggerEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.SWAGGER_ENABLED === "1";
  if (swaggerEnabled) {
    const openApi = new DocumentBuilder()
      .setTitle("锦程 ERP API")
      .setDescription("网站端、未来 PC、APP 与小程序共用的业务 API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, openApi);
    SwaggerModule.setup("docs", app, document);
  }

  const port = Number(process.env.API_PORT ?? 3100);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
