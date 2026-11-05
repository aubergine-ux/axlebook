import {
  AiStatus,
  ApiError,
  MaintenanceSchedule,
  MpgEstimate,
  ScheduleApplyInput,
  VehicleTips,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Ai } from '../../lib/ai';
import { currentUser } from '../../plugins/auth';
import type { InsightService } from './service';

const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
const errors = { 400: ApiError, 403: ApiError, 404: ApiError, 502: ApiError, 503: ApiError };

export const insightRoutes =
  ({ insights, ai }: { insights: InsightService; ai: Ai }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/ai/status',
      {
        schema: {
          tags: ['ai'],
          summary: 'Local assistant (Ollama) status',
          description:
            'The assistant runs on your own server through Ollama (OLLAMA_URL). Nothing is sent to outside services.',
          response: { 200: AiStatus },
        },
      },
      async (req) => {
        currentUser(req);
        return ai.status();
      },
    );
    app.get(
      '/vehicles/:vehicleId/insights/mpg',
      {
        schema: {
          tags: ['ai'],
          summary: 'The saved fuel economy estimate',
          params: VehicleParam,
          response: { 200: MpgEstimate.nullable(), ...errors },
        },
      },
      async (req) => insights.mpg(currentUser(req), req.params.vehicleId),
    );
    app.post(
      '/vehicles/:vehicleId/insights/mpg',
      {
        schema: {
          tags: ['ai'],
          summary: 'Estimate expected fuel economy with the local AI',
          description:
            "Uses the make, model, age, mileage and service history. Values are in the vehicle's own units.",
          params: VehicleParam,
          response: { 200: MpgEstimate, ...errors },
        },
      },
      async (req) => insights.estimateMpg(currentUser(req), req.params.vehicleId),
    );
    app.get(
      '/vehicles/:vehicleId/tips',
      {
        schema: {
          tags: ['tips'],
          summary: 'Tips for this vehicle',
          description:
            'Worked out from its data (economy trends, overdue jobs, the season), plus saved local-AI tips for the exact make and model.',
          params: VehicleParam,
          response: { 200: VehicleTips, ...errors },
        },
      },
      async (req) => insights.tips(currentUser(req), req.params.vehicleId),
    );
    app.post(
      '/vehicles/:vehicleId/tips/ai',
      {
        schema: {
          tags: ['tips', 'ai'],
          summary: 'Get make- and model-specific tips from the local AI',
          params: VehicleParam,
          response: { 200: VehicleTips, ...errors },
        },
      },
      async (req) => insights.aiTips(currentUser(req), req.params.vehicleId),
    );
    app.get(
      '/vehicles/:vehicleId/schedule',
      {
        schema: {
          tags: ['maintenance'],
          summary: 'Maintenance schedule with last-done and next-due',
          description:
            'The built-in schedule for this kind of vehicle, or the AI-tailored one if it was generated.',
          params: VehicleParam,
          response: { 200: MaintenanceSchedule, ...errors },
        },
      },
      async (req) => insights.schedule(currentUser(req), req.params.vehicleId),
    );
    app.post(
      '/vehicles/:vehicleId/schedule/tailor',
      {
        schema: {
          tags: ['maintenance', 'ai'],
          summary: 'Tailor the schedule to this exact vehicle with the local AI',
          params: VehicleParam,
          response: { 200: MaintenanceSchedule, ...errors },
        },
      },
      async (req) => insights.tailorSchedule(currentUser(req), req.params.vehicleId),
    );
    app.post(
      '/vehicles/:vehicleId/schedule/apply',
      {
        schema: {
          tags: ['maintenance'],
          summary: 'Create reminders from schedule items',
          description: 'Items whose title matches an existing reminder are skipped.',
          params: VehicleParam,
          body: ScheduleApplyInput,
          response: { 200: z.object({ created: z.number().int() }), ...errors },
        },
      },
      async (req) => insights.applySchedule(currentUser(req), req.params.vehicleId, req.body.items),
    );
  };
