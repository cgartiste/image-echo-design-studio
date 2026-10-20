export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          module: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          module: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          module?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      campaign_logs: {
        Row: {
          action: string | null
          actor_id: string | null
          campaign_id: string
          created_at: string
          from_status: string | null
          id: string
          level: string
          message: string
          to_status: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          campaign_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          level?: string
          message: string
          to_status?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          campaign_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          level?: string
          message?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          bounces: number
          clicks: number
          complaints: number
          conversions: number
          cost: number
          created_at: string
          created_by: string | null
          daily_limit: number | null
          delivered: number
          ended_at: string | null
          from_email: string | null
          from_name: string | null
          handle_bounces: boolean
          handle_unsubscribes: boolean
          html_content: string
          id: string
          list_id: string | null
          name: string
          offer: string | null
          opens: number
          preheader: string | null
          recipient_count: number
          reply_to: string | null
          revenue: number
          scheduled_at: string | null
          send_speed: number
          sent: number
          server_pool: string | null
          settings: Json
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          subject: string
          text_content: string | null
          timezone: string
          track_clicks: boolean
          track_conversions: boolean
          track_opens: boolean
          unsubscribes: number
          updated_at: string
          use_global_suppression: boolean
        }
        Insert: {
          bounces?: number
          clicks?: number
          complaints?: number
          conversions?: number
          cost?: number
          created_at?: string
          created_by?: string | null
          daily_limit?: number | null
          delivered?: number
          ended_at?: string | null
          from_email?: string | null
          from_name?: string | null
          handle_bounces?: boolean
          handle_unsubscribes?: boolean
          html_content?: string
          id?: string
          list_id?: string | null
          name: string
          offer?: string | null
          opens?: number
          preheader?: string | null
          recipient_count?: number
          reply_to?: string | null
          revenue?: number
          scheduled_at?: string | null
          send_speed?: number
          sent?: number
          server_pool?: string | null
          settings?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          text_content?: string | null
          timezone?: string
          track_clicks?: boolean
          track_conversions?: boolean
          track_opens?: boolean
          unsubscribes?: number
          updated_at?: string
          use_global_suppression?: boolean
        }
        Update: {
          bounces?: number
          clicks?: number
          complaints?: number
          conversions?: number
          cost?: number
          created_at?: string
          created_by?: string | null
          daily_limit?: number | null
          delivered?: number
          ended_at?: string | null
          from_email?: string | null
          from_name?: string | null
          handle_bounces?: boolean
          handle_unsubscribes?: boolean
          html_content?: string
          id?: string
          list_id?: string | null
          name?: string
          offer?: string | null
          opens?: number
          preheader?: string | null
          recipient_count?: number
          reply_to?: string | null
          revenue?: number
          scheduled_at?: string | null
          send_speed?: number
          sent?: number
          server_pool?: string | null
          settings?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          text_content?: string | null
          timezone?: string
          track_clicks?: boolean
          track_conversions?: boolean
          track_opens?: boolean
          unsubscribes?: number
          updated_at?: string
          use_global_suppression?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      conversions: {
        Row: {
          campaign_ref: string | null
          converted_at: string
          created_at: string
          external_id: string
          id: string
          interface_ref: string | null
          list_ref: string | null
          offer_external_id: string | null
          offer_name: string | null
          offer_ref: string | null
          payout: number
          sponsor_id: string
          sub1: string | null
          sub2: string | null
          sub3: string | null
          subscriber_ref: string | null
          user_ref: string | null
        }
        Insert: {
          campaign_ref?: string | null
          converted_at?: string
          created_at?: string
          external_id: string
          id?: string
          interface_ref?: string | null
          list_ref?: string | null
          offer_external_id?: string | null
          offer_name?: string | null
          offer_ref?: string | null
          payout?: number
          sponsor_id: string
          sub1?: string | null
          sub2?: string | null
          sub3?: string | null
          subscriber_ref?: string | null
          user_ref?: string | null
        }
        Update: {
          campaign_ref?: string | null
          converted_at?: string
          created_at?: string
          external_id?: string
          id?: string
          interface_ref?: string | null
          list_ref?: string | null
          offer_external_id?: string | null
          offer_name?: string | null
          offer_ref?: string | null
          payout?: number
          sponsor_id?: string
          sub1?: string | null
          sub2?: string | null
          sub3?: string | null
          subscriber_ref?: string | null
          user_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversions_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_stats: {
        Row: {
          bounces: number
          clicks: number
          complaints: number
          conversions: number
          cost: number
          day: string
          delivered: number
          opens: number
          revenue: number
          sent: number
          unsubscribes: number
        }
        Insert: {
          bounces?: number
          clicks?: number
          complaints?: number
          conversions?: number
          cost?: number
          day: string
          delivered?: number
          opens?: number
          revenue?: number
          sent?: number
          unsubscribes?: number
        }
        Update: {
          bounces?: number
          clicks?: number
          complaints?: number
          conversions?: number
          cost?: number
          day?: string
          delivered?: number
          opens?: number
          revenue?: number
          sent?: number
          unsubscribes?: number
        }
        Relationships: []
      }
      domains: {
        Row: {
          account_id: string | null
          checks: Json
          created_at: string
          dkim_selector: string
          id: string
          last_checked_at: string | null
          name: string
          nameservers: string[]
          notes: string | null
          provider: string | null
          score: number
          status: string
          zone_ref: string | null
        }
        Insert: {
          account_id?: string | null
          checks?: Json
          created_at?: string
          dkim_selector?: string
          id?: string
          last_checked_at?: string | null
          name: string
          nameservers?: string[]
          notes?: string | null
          provider?: string | null
          score?: number
          status?: string
          zone_ref?: string | null
        }
        Update: {
          account_id?: string | null
          checks?: Json
          created_at?: string
          dkim_selector?: string
          id?: string
          last_checked_at?: string | null
          name?: string
          nameservers?: string[]
          notes?: string | null
          provider?: string | null
          score?: number
          status?: string
          zone_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mta_servers: {
        Row: {
          agent_token_enc: string
          agent_token_hash: string
          config: Json
          created_at: string
          created_by: string | null
          hostname: string | null
          id: string
          ip: string
          kumo_active: boolean
          kumo_installed: boolean
          kumo_version: string | null
          last_error: string | null
          last_seen_at: string | null
          name: string
          paused: boolean
          pool: string
          ports: Json
          provider: string | null
          ses_account_id: string | null
          status: string
          system: Json
        }
        Insert: {
          agent_token_enc: string
          agent_token_hash: string
          config?: Json
          created_at?: string
          created_by?: string | null
          hostname?: string | null
          id?: string
          ip: string
          kumo_active?: boolean
          kumo_installed?: boolean
          kumo_version?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          name: string
          paused?: boolean
          pool?: string
          ports?: Json
          provider?: string | null
          ses_account_id?: string | null
          status?: string
          system?: Json
        }
        Update: {
          agent_token_enc?: string
          agent_token_hash?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          hostname?: string | null
          id?: string
          ip?: string
          kumo_active?: boolean
          kumo_installed?: boolean
          kumo_version?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          name?: string
          paused?: boolean
          pool?: string
          ports?: Json
          provider?: string | null
          ses_account_id?: string | null
          status?: string
          system?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mta_servers_ses_account_id_fkey"
            columns: ["ses_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          assigned_to: string | null
          countries: string[]
          created_at: string
          currency: string | null
          description: string | null
          external_id: string
          id: string
          image_url: string | null
          imported: boolean
          name: string
          payout: number
          payout_type: string | null
          preview_url: string | null
          sponsor_id: string
          status: string
          tracking_url: string | null
          updated_at: string
          vertical: string | null
        }
        Insert: {
          assigned_to?: string | null
          countries?: string[]
          created_at?: string
          currency?: string | null
          description?: string | null
          external_id: string
          id?: string
          image_url?: string | null
          imported?: boolean
          name: string
          payout?: number
          payout_type?: string | null
          preview_url?: string | null
          sponsor_id: string
          status?: string
          tracking_url?: string | null
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          assigned_to?: string | null
          countries?: string[]
          created_at?: string
          currency?: string | null
          description?: string | null
          external_id?: string
          id?: string
          image_url?: string | null
          imported?: boolean
          name?: string
          payout?: number
          payout_type?: string | null
          preview_url?: string | null
          sponsor_id?: string
          status?: string
          tracking_url?: string | null
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          credentials_encrypted: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          name: string
          provider: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credentials_encrypted: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name: string
          provider: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          provider?: string
          status?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      saved_message_configs: {
        Row: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          configuration: Json
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      seed_accounts: {
        Row: {
          connection_key_ciphertext: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          label: string
          last_checked_at: string | null
          last_error: string | null
          provider: string
          reconnect_required: boolean
          status: string
          updated_at: string
        }
        Insert: {
          connection_key_ciphertext?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          label?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          reconnect_required?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          connection_key_ciphertext?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          label?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          reconnect_required?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      send_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          detail: string | null
          id: string
          ip: string | null
          job_id: string | null
          kind: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ip?: string | null
          job_id?: string | null
          kind: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ip?: string | null
          job_id?: string | null
          kind?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "send_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "send_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      send_jobs: {
        Row: {
          attempts: number
          campaign_id: string
          claimed_at: string | null
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          email: string
          error: string | null
          id: string
          is_test: boolean
          opened_at: string | null
          sent_at: string | null
          server_id: string | null
          status: string
          subscriber_id: string | null
          variant: string | null
        }
        Insert: {
          attempts?: number
          campaign_id: string
          claimed_at?: string | null
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email: string
          error?: string | null
          id?: string
          is_test?: boolean
          opened_at?: string | null
          sent_at?: string | null
          server_id?: string | null
          status?: string
          subscriber_id?: string | null
          variant?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string
          claimed_at?: string | null
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string
          error?: string | null
          id?: string
          is_test?: boolean
          opened_at?: string | null
          sent_at?: string | null
          server_id?: string | null
          status?: string
          subscriber_id?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "send_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_jobs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mta_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_jobs_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_ips: {
        Row: {
          account_id: string | null
          created_at: string
          hostname: string | null
          id: string
          ip: string
          last_checked_at: string | null
          provider: string | null
          ptr_current: string | null
          rdns_ok: boolean | null
          server_ref: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          hostname?: string | null
          id?: string
          ip: string
          last_checked_at?: string | null
          provider?: string | null
          ptr_current?: string | null
          rdns_ok?: boolean | null
          server_ref?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          hostname?: string | null
          id?: string
          ip?: string
          last_checked_at?: string | null
          provider?: string | null
          ptr_current?: string | null
          rdns_ok?: boolean | null
          server_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sending_ips_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      server_commands: {
        Row: {
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          kind: string
          output: string | null
          payload: Json
          server_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          output?: string | null
          payload?: Json
          server_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          output?: string | null
          payload?: Json
          server_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_commands_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mta_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          level: string
          message: string
          sponsor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          level?: string
          message: string
          sponsor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          level?: string
          message?: string
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_events_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_login_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip: string | null
          result: string
          sponsor_id: string
          token_hash: string
          used_at: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip?: string | null
          result?: string
          sponsor_id: string
          token_hash: string
          used_at?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip?: string | null
          result?: string
          sponsor_id?: string
          token_hash?: string
          used_at?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_login_sessions_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          affiliate_id: string | null
          api_driver: string
          api_url: string | null
          created_at: string
          created_by: string | null
          credentials_encrypted: string | null
          has_api_key: boolean
          has_password: boolean
          home_url: string | null
          id: string
          last_conversion_sync_at: string | null
          last_error: string | null
          last_offer_sync_at: string | null
          last_test_at: string | null
          login_driver: string
          login_url: string | null
          name: string
          platform: string
          report_url: string | null
          status: string
          tracking_template: string | null
        }
        Insert: {
          affiliate_id?: string | null
          api_driver?: string
          api_url?: string | null
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: string | null
          has_api_key?: boolean
          has_password?: boolean
          home_url?: string | null
          id?: string
          last_conversion_sync_at?: string | null
          last_error?: string | null
          last_offer_sync_at?: string | null
          last_test_at?: string | null
          login_driver?: string
          login_url?: string | null
          name: string
          platform: string
          report_url?: string | null
          status?: string
          tracking_template?: string | null
        }
        Update: {
          affiliate_id?: string | null
          api_driver?: string
          api_url?: string | null
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: string | null
          has_api_key?: boolean
          has_password?: boolean
          home_url?: string | null
          id?: string
          last_conversion_sync_at?: string | null
          last_error?: string | null
          last_offer_sync_at?: string | null
          last_test_at?: string | null
          login_driver?: string
          login_url?: string | null
          name?: string
          platform?: string
          report_url?: string | null
          status?: string
          tracking_template?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          blocked: boolean
          bounce_count: number
          city: string | null
          country: string | null
          created_at: string
          email: string
          engagement: number
          first_name: string | null
          id: string
          ip: string | null
          language: string | null
          last_click_at: string | null
          last_conversion_at: string | null
          last_name: string | null
          last_open_at: string | null
          last_sent_at: string | null
          list_id: string
          phone: string | null
          region: string | null
          source: string | null
          status: string
          subscribed_at: string
          tags: string[]
          unsubscribed: boolean
        }
        Insert: {
          blocked?: boolean
          bounce_count?: number
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          engagement?: number
          first_name?: string | null
          id?: string
          ip?: string | null
          language?: string | null
          last_click_at?: string | null
          last_conversion_at?: string | null
          last_name?: string | null
          last_open_at?: string | null
          last_sent_at?: string | null
          list_id: string
          phone?: string | null
          region?: string | null
          source?: string | null
          status?: string
          subscribed_at?: string
          tags?: string[]
          unsubscribed?: boolean
        }
        Update: {
          blocked?: boolean
          bounce_count?: number
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          engagement?: number
          first_name?: string | null
          id?: string
          ip?: string | null
          language?: string | null
          last_click_at?: string | null
          last_conversion_at?: string | null
          last_name?: string | null
          last_open_at?: string | null
          last_sent_at?: string | null
          list_id?: string
          phone?: string | null
          region?: string | null
          source?: string | null
          status?: string
          subscribed_at?: string
          tags?: string[]
          unsubscribed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subscribers_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_files: {
        Row: {
          created_at: string
          download_url: string | null
          id: string
          offer_id: string | null
          source_type: string
          source_url: string
          sponsor_id: string
          status: string
        }
        Insert: {
          created_at?: string
          download_url?: string | null
          id?: string
          offer_id?: string | null
          source_type?: string
          source_url: string
          sponsor_id: string
          status?: string
        }
        Update: {
          created_at?: string
          download_url?: string | null
          id?: string
          offer_id?: string | null
          source_type?: string
          source_url?: string
          sponsor_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_files_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_files_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_campaign_stat: {
        Args: { _cid: string; _field: string; _n: number }
        Returns: undefined
      }
      campaign_recipient_summary: {
        Args: {
          country_filter?: string
          engagement_min?: number
          excluded?: string[]
          included: string[]
        }
        Returns: Json
      }
      claim_send_jobs: {
        Args: { _limit: number; _server: string }
        Returns: {
          attempts: number
          campaign_id: string
          claimed_at: string | null
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          email: string
          error: string | null
          id: string
          is_test: boolean
          opened_at: string | null
          sent_at: string | null
          server_id: string | null
          status: string
          subscriber_id: string | null
          variant: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "send_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clone_campaign: { Args: { source_id: string }; Returns: string }
      enqueue_campaign: { Args: { cid: string }; Returns: number }
      has_permission: {
        Args: { _action: string; _module: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "manager"
        | "operator"
        | "analyst"
        | "viewer"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "failed"
        | "cancelled"
        | "archived"
        | "ready"
        | "publishing"
        | "stopping"
        | "stopped"
        | "test"
        | "waiting_approval"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "manager",
        "operator",
        "analyst",
        "viewer",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
        "archived",
        "ready",
        "publishing",
        "stopping",
        "stopped",
        "test",
        "waiting_approval",
      ],
    },
  },
} as const
