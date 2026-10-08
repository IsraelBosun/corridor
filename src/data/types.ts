import type { Minutes } from '@/lib/time';

export type Person = {
  id: string;
  /** Local part of the work address. Only ever shown to the person themselves. */
  handle?: string;
  /** Initials are the only avatar. No photos, ever. */
  initials: string;
  name: string;
  team: string;
  /** Floor is for finding each other in the building, not for display alone. */
  floor: string;
  /**
   * Where this person gets off. A corridor stop, or anywhere they searched for.
   *
   * One current value, overwritten when they change it. There is deliberately
   * no history: knowing where somebody is going tonight is the job, knowing
   * where they went last Tuesday is not.
   */
  dropOff?: DropOff;
  role?: Role;
  /** How to spot a driver's car, from their account. Copied onto each ride. */
  car?: string;
};

/**
 * Somewhere to get off. Named the way the person named it, with coordinates
 * when we have them so a trip can be measured against it.
 */
export type DropOff = {
  /** Set by a stop chosen before stops were retired. Nothing reads it now. */
  landmarkId?: string;
  name: string;
  lat?: number;
  lng?: number;
};

export type Destination = { name: string; lat: number; lng: number };

export type TripStatus = 'posted' | 'boarding' | 'left' | 'cancelled';

export type Trip = {
  /** The database id. Used for routing and every query. */
  id: string;
  /** The four character code people read out loud. Shown, never queried. */
  code: string;
  driverId: string;
  /**
   * Where the ride starts, searched by the driver. Riders meet the car here.
   * Lives on tonight's trip only and goes with it.
   */
  origin?: Destination;
  /**
   * Where the driver is going. Searched the same way a rider's drop off is.
   * Lives on tonight's trip only and goes with it.
   */
  destination?: Destination;
  departMin: Minutes;
  /** The give or take. The departure is a window, not a time. */
  toleranceMin: number;
  seatsTotal: number;
  /** Person ids holding a confirmed seat. */
  riders: string[];
  /** Person id to the time they said they were at the start of the ride. */
  presentAt: Record<string, Minutes>;
  vehicle: string;
  note: string;
  status: TripStatus;
  /** Push the riders the moment the driver sets off. */
  announceOnDepart: boolean;
  cancelledAtMin?: Minutes;
};

/**
 * What someone usually is. Not a permission: a driver can still take a seat in
 * somebody else's car, and a passenger who borrows one can still post a trip.
 * It decides what the corridor screen leads with, and nothing more.
 */
export type Role = 'driver' | 'passenger';
