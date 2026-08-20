import { Module } from '@nestjs/common';
import { MlClient } from './ml.client';
import { CategorySuggesterService } from './category-suggester.service';

@Module({
  providers: [MlClient, CategorySuggesterService],
  exports: [MlClient, CategorySuggesterService],
})
export class MlModule {}
