type AccountsInsert = {
  id?: string;
  user_id: string;
  name: string;
  kind: "plant" | "customer";
  plant_location?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  status?: "hot" | "warm" | "cool" | "stable" | "pending_confirmation";
  notes?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

type CustomerContactsInsert = {
  id?: string;
  account_id: string;
  name: string;
  role?: string | null;
  created_at?: string;
}

type CustomerTopicsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  title: string;
  description?: string | null;
  status?: "open" | "discussed";
  related_to?: string | null;
  created_at?: string;
  discussed_at?: string | null;
  due_date?: string | null;
  commitment_owner?: "me" | "them" | null;
}

type GeneralNotesInsert = {
  id?: string;
  user_id: string;
  text: string;
  tags?: string[];
  related_account_id?: string | null;
  created_at?: string;
}

type UserFocusInsert = {
  id?: string;
  user_id: string;
  focus_text?: string | null;
  updated_at?: string;
}

type RateCalculationsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  formula_type: "percentage_fsc" | "per_mile_fsc";
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  created_at?: string;
}

type RateDefaultsInsert = {
  id?: string;
  account_id: string;
  formula_type: "percentage_fsc" | "per_mile_fsc";
  target_per_hour: number;
  time_add_hours: number;
  avg_speed_mph: number;
  mpg: number;
  ppg: number;
  fsc_percent?: number | null;
  baseline_price?: number | null;
  updated_at?: string;
}

type LoadsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  lane?: string | null;
  tonnage?: number | null;
  rate_type?: "hourly" | "percentage" | "per_ton" | null;
  scheduled_date?: string | null;
  status?: "scheduled" | "in_progress" | "complete" | "cancelled";
  driver?: string | null;
  created_at?: string;
}

type CorrectiveActionsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  title: string;
  description?: string | null;
  severity?: "hot" | "warm" | "resolved";
  incident_date?: string | null;
  vendor_involved?: string | null;
  resolution_notes?: string | null;
  created_at?: string;
  resolved_at?: string | null;
}

type TasksInsert = {
  id?: string;
  user_id: string;
  title: string;
  description?: string | null;
  urgency?: "today" | "this_week" | "this_month" | "someday";
  key?: boolean;
  account_id?: string | null;
  priority_score?: number | null;
  due_date?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

type LaneFinancialsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  period: string;
  net_tons?: number | null;
  revenue?: number | null;
  fuel_cost?: number | null;
  other_cost?: number | null;
  margin_pct?: number | null;
  fsc_applied?: boolean;
  created_at?: string;
}

type RawCapturesInsert = {
  id?: string;
  user_id: string;
  source: string;
  raw_text?: string | null;
  audio_url?: string | null;
  classification?: Record<string, unknown> | null;
  routed_to?: string | null;
  routed_id?: string | null;
  created_at?: string;
}

type MemoryChunksInsert = {
  id?: string;
  user_id: string;
  source_type: string;
  source_id: string;
  text: string;
  embedding?: number[] | null;
  created_at?: string;
}

type WeeklyReviewsInsert = {
  id?: string;
  user_id: string;
  week_start: string;
  wins?: string | null;
  what_slipped?: string | null;
  open_loops?: string | null;
  accounts_to_follow_up?: string[] | null;
  top_3_next_week?: string | null;
  created_at?: string;
  sealed_at?: string | null;
}

type CallPrepsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  raw_input: string;
  generated_script: string;
  created_at?: string;
}

type EmailDraftsInsert = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  raw_input: string;
  subject_line: string;
  generated_body: string;
  created_at?: string;
}

type CurrentFuelPriceInsert = {
  id?: string;
  ppg: number;
  source?: string;
  period_date: string;
  fetched_at?: string;
}

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: "plant" | "customer";
          plant_location: string | null;
          contact_name: string | null;
          contact_role: string | null;
          status: "hot" | "warm" | "cool" | "stable" | "pending_confirmation";
          notes: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: AccountsInsert;
        Update: Partial<AccountsInsert>;
        Relationships: [];
      };
      customer_contacts: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          role: string | null;
          created_at: string;
        };
        Insert: CustomerContactsInsert;
        Update: Partial<CustomerContactsInsert>;
        Relationships: [];
      };
      customer_topics: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          title: string;
          description: string | null;
          status: "open" | "discussed";
          related_to: string | null;
          created_at: string;
          discussed_at: string | null;
          due_date: string | null;
          commitment_owner: "me" | "them" | null;
        };
        Insert: CustomerTopicsInsert;
        Update: Partial<CustomerTopicsInsert>;
        Relationships: [];
      };
      general_notes: {
        Row: {
          id: string;
          user_id: string;
          text: string;
          tags: string[];
          related_account_id: string | null;
          created_at: string;
        };
        Insert: GeneralNotesInsert;
        Update: Partial<GeneralNotesInsert>;
        Relationships: [];
      };
      user_focus: {
        Row: {
          id: string;
          user_id: string;
          focus_text: string | null;
          updated_at: string;
        };
        Insert: UserFocusInsert;
        Update: Partial<UserFocusInsert>;
        Relationships: [];
      };
      rate_calculations: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          formula_type: "percentage_fsc" | "per_mile_fsc";
          inputs: Record<string, unknown>;
          outputs: Record<string, unknown>;
          created_at: string;
        };
        Insert: RateCalculationsInsert;
        Update: Partial<RateCalculationsInsert>;
        Relationships: [];
      };
      rate_defaults: {
        Row: {
          id: string;
          account_id: string;
          formula_type: "percentage_fsc" | "per_mile_fsc";
          target_per_hour: number;
          time_add_hours: number;
          avg_speed_mph: number;
          mpg: number;
          ppg: number;
          fsc_percent: number | null;
          baseline_price: number | null;
          updated_at: string;
        };
        Insert: RateDefaultsInsert;
        Update: Partial<RateDefaultsInsert>;
        Relationships: [];
      };
      loads: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          lane: string | null;
          tonnage: number | null;
          rate_type: "hourly" | "percentage" | "per_ton" | null;
          scheduled_date: string | null;
          status: "scheduled" | "in_progress" | "complete" | "cancelled";
          driver: string | null;
          created_at: string;
        };
        Insert: LoadsInsert;
        Update: Partial<LoadsInsert>;
        Relationships: [];
      };
      corrective_actions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          title: string;
          description: string | null;
          severity: "hot" | "warm" | "resolved";
          incident_date: string | null;
          vendor_involved: string | null;
          resolution_notes: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: CorrectiveActionsInsert;
        Update: Partial<CorrectiveActionsInsert>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          urgency: "today" | "this_week" | "this_month" | "someday";
          key: boolean;
          account_id: string | null;
          priority_score: number | null;
          due_date: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: TasksInsert;
        Update: Partial<TasksInsert>;
        Relationships: [];
      };
      lane_financials: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          period: string;
          net_tons: number | null;
          revenue: number | null;
          fuel_cost: number | null;
          other_cost: number | null;
          margin_pct: number | null;
          fsc_applied: boolean;
          created_at: string;
        };
        Insert: LaneFinancialsInsert;
        Update: Partial<LaneFinancialsInsert>;
        Relationships: [];
      };
      raw_captures: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          raw_text: string | null;
          audio_url: string | null;
          classification: Record<string, unknown> | null;
          routed_to: string | null;
          routed_id: string | null;
          created_at: string;
        };
        Insert: RawCapturesInsert;
        Update: Partial<RawCapturesInsert>;
        Relationships: [];
      };
      memory_chunks: {
        Row: {
          id: string;
          user_id: string;
          source_type: string;
          source_id: string;
          text: string;
          embedding: string | null;
          created_at: string;
        };
        Insert: MemoryChunksInsert;
        Update: Partial<MemoryChunksInsert>;
        Relationships: [];
      };
      weekly_reviews: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          wins: string | null;
          what_slipped: string | null;
          open_loops: string | null;
          accounts_to_follow_up: string[] | null;
          top_3_next_week: string | null;
          created_at: string;
          sealed_at: string | null;
        };
        Insert: WeeklyReviewsInsert;
        Update: Partial<WeeklyReviewsInsert>;
        Relationships: [];
      };
      call_preps: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          raw_input: string;
          generated_script: string;
          created_at: string;
        };
        Insert: CallPrepsInsert;
        Update: Partial<CallPrepsInsert>;
        Relationships: [];
      };
      email_drafts: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          raw_input: string;
          subject_line: string;
          generated_body: string;
          created_at: string;
        };
        Insert: EmailDraftsInsert;
        Update: Partial<EmailDraftsInsert>;
        Relationships: [];
      };
      current_fuel_price: {
        Row: {
          id: string;
          ppg: number;
          source: string;
          period_date: string;
          fetched_at: string;
        };
        Insert: CurrentFuelPriceInsert;
        Update: Partial<CurrentFuelPriceInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
