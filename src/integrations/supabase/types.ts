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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_requests: {
        Row: {
          attempts: number
          challenge_id: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          failure_reason: string | null
          fulfilled_at: string | null
          id: string
          order_id: string
          provider_response: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          challenge_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          failure_reason?: string | null
          fulfilled_at?: string | null
          id?: string
          order_id: string
          provider_response?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          challenge_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          failure_reason?: string | null
          fulfilled_at?: string | null
          id?: string
          order_id?: string
          provider_response?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_snapshots: {
        Row: {
          balance: number
          drawdown_percent: number
          equity: number
          id: string
          profit: number
          snapshot_time: string
          trader_account_id: string
        }
        Insert: {
          balance: number
          drawdown_percent?: number
          equity: number
          id?: string
          profit?: number
          snapshot_time?: string
          trader_account_id: string
        }
        Update: {
          balance?: number
          drawdown_percent?: number
          equity?: number
          id?: string
          profit?: number
          snapshot_time?: string
          trader_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_snapshots_trader_account_id_fkey"
            columns: ["trader_account_id"]
            isOneToOne: false
            referencedRelation: "trader_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          affiliate_user_id: string
          amount_naira: number
          created_at: string
          id: string
          order_id: string
          referred_user_id: string
          status: string
        }
        Insert: {
          affiliate_user_id: string
          amount_naira: number
          created_at?: string
          id?: string
          order_id: string
          referred_user_id: string
          status?: string
        }
        Update: {
          affiliate_user_id?: string
          amount_naira?: number
          created_at?: string
          id?: string
          order_id?: string
          referred_user_id?: string
          status?: string
        }
        Relationships: []
      }
      affiliate_free_account_claims: {
        Row: {
          account_size: number
          created_at: string
          id: string
          status: string
          trader_account_id: string | null
          user_id: string
        }
        Insert: {
          account_size?: number
          created_at?: string
          id?: string
          status?: string
          trader_account_id?: string | null
          user_id: string
        }
        Update: {
          account_size?: number
          created_at?: string
          id?: string
          status?: string
          trader_account_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      affiliate_free_accounts: {
        Row: {
          account_size: number | null
          admin_note: string | null
          affiliate_id: string
          challenge_name: string | null
          claimed_at: string
          created_at: string
          fulfilled_at: string | null
          id: string
          investor_password: string | null
          mt5_login: string | null
          mt5_password: string | null
          mt5_server: string | null
          referral_batch: number
          status: string
        }
        Insert: {
          account_size?: number | null
          admin_note?: string | null
          affiliate_id: string
          challenge_name?: string | null
          claimed_at?: string
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          investor_password?: string | null
          mt5_login?: string | null
          mt5_password?: string | null
          mt5_server?: string | null
          referral_batch: number
          status?: string
        }
        Update: {
          account_size?: number | null
          admin_note?: string | null
          affiliate_id?: string
          challenge_name?: string | null
          claimed_at?: string
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          investor_password?: string | null
          mt5_login?: string | null
          mt5_password?: string | null
          mt5_server?: string | null
          referral_batch?: number
          status?: string
        }
        Relationships: []
      }
      affiliate_payouts: {
        Row: {
          admin_note: string | null
          amount_naira: number
          approved_at: string | null
          bank_details: Json | null
          created_at: string
          id: string
          paid_at: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_naira: number
          approved_at?: string | null
          bank_details?: Json | null
          created_at?: string
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_naira?: number
          approved_at?: string | null
          bank_details?: Json | null
          created_at?: string
          id?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_profiles: {
        Row: {
          code: string
          created_at: string
          free_accounts_claimed: number
          free_accounts_credited: number
          id: string
          total_earned_naira: number
          total_paid_naira: number
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          free_accounts_claimed?: number
          free_accounts_credited?: number
          id?: string
          total_earned_naira?: number
          total_paid_naira?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          free_accounts_claimed?: number
          free_accounts_credited?: number
          id?: string
          total_earned_naira?: number
          total_paid_naira?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          account_size: number
          certificate_number: string
          challenge_name: string
          created_at: string
          full_name: string
          id: string
          issued_at: string
          kind: Database["public"]["Enums"]["certificate_kind"]
          mt5_login: string
          payout_amount: number | null
          payout_id: string | null
          trader_account_id: string
          user_id: string
        }
        Insert: {
          account_size: number
          certificate_number: string
          challenge_name: string
          created_at?: string
          full_name: string
          id?: string
          issued_at?: string
          kind: Database["public"]["Enums"]["certificate_kind"]
          mt5_login: string
          payout_amount?: number | null
          payout_id?: string | null
          trader_account_id: string
          user_id: string
        }
        Update: {
          account_size?: number
          certificate_number?: string
          challenge_name?: string
          created_at?: string
          full_name?: string
          id?: string
          issued_at?: string
          kind?: Database["public"]["Enums"]["certificate_kind"]
          mt5_login?: string
          payout_amount?: number | null
          payout_id?: string | null
          trader_account_id?: string
          user_id?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          account_size: number
          challenge_type: string
          created_at: string
          currency: string | null
          discount_percent: number | null
          drawdown_type: string
          id: string
          is_active: boolean
          max_daily_drawdown_percent: number | null
          max_drawdown_percent: number
          max_trading_days: number | null
          min_trading_days: number
          name: string
          phases: number
          phase2_profit_target_percent: number | null
          price_naira: number
          profit_target_percent: number
        }
        Insert: {
          account_size: number
          challenge_type?: string
          created_at?: string
          currency?: string | null
          discount_percent?: number | null
          drawdown_type?: string
          id?: string
          is_active?: boolean
          max_daily_drawdown_percent?: number | null
          max_drawdown_percent?: number
          max_trading_days?: number | null
          min_trading_days?: number
          name: string
          phases?: number
          phase2_profit_target_percent?: number | null
          price_naira: number
          profit_target_percent?: number
        }
        Update: {
          account_size?: number
          challenge_type?: string
          created_at?: string
          currency?: string | null
          discount_percent?: number | null
          drawdown_type?: string
          id?: string
          is_active?: boolean
          max_daily_drawdown_percent?: number | null
          max_drawdown_percent?: number
          max_trading_days?: number | null
          min_trading_days?: number
          name?: string
          phases?: number
          phase2_profit_target_percent?: number | null
          price_naira?: number
          profit_target_percent?: number
        }
         Relationships: []
      }
      community_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          percent_off: number
          redemption_count: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          percent_off?: number
          redemption_count?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          percent_off?: number
          redemption_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          created_at: string
          edited_at: string | null
          group_id: string
          id: string
          image_url: string | null
          reply_to_id: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          group_id: string
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          group_id?: string
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mt5_worker_events: {
        Row: {
          account_request_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          trader_account_id: string | null
          worker_id: string | null
        }
        Insert: {
          account_request_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          trader_account_id?: string | null
          worker_id?: string | null
        }
        Update: {
          account_request_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          trader_account_id?: string | null
          worker_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_paid: number
          challenge_id: string
          created_at: string
          discount_amount: number
          discount_code: string | null
          discount_percent: number
          id: string
          original_amount: number | null
          partner_promo_code: string | null
          paystack_reference: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          challenge_id: string
          created_at?: string
          discount_amount?: number
          discount_code?: string | null
          discount_percent?: number
          id?: string
          original_amount?: number | null
          partner_promo_code?: string | null
          paystack_reference?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          challenge_id?: string
          created_at?: string
          discount_amount?: number
          discount_code?: string | null
          discount_percent?: number
          id?: string
          original_amount?: number | null
          partner_promo_code?: string | null
          paystack_reference?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_applications: {
        Row: {
          id: string
          created_at: string
          full_name: string
          email: string
          phone: string
          country: string
          primary_platform: string
          profile_link: string
          follower_count: string
          community_type: string
          community_size: string | null
          community_link: string | null
          actively_trades: string
          trading_style: string
          passed_challenge: string
          challenge_platform: string | null
          willing_to_pass_publicly: string
          why_funded_ng: string
          content_type: string
          other_prop_firms: string
          sample_content_link: string | null
          agree_no_giveaway_only: boolean
          agree_public_challenge: boolean
          agree_no_dm: boolean
          agree_terms: boolean
          status: string
        }
        Insert: {
          id?: string
          created_at?: string
          full_name: string
          email: string
          phone: string
          country: string
          primary_platform: string
          profile_link: string
          follower_count: string
          community_type: string
          community_size?: string | null
          community_link?: string | null
          actively_trades: string
          trading_style: string
          passed_challenge: string
          challenge_platform?: string | null
          willing_to_pass_publicly: string
          why_funded_ng: string
          content_type: string
          other_prop_firms: string
          sample_content_link?: string | null
          agree_no_giveaway_only?: boolean
          agree_public_challenge?: boolean
          agree_no_dm?: boolean
          agree_terms?: boolean
          status?: string
        }
        Update: {
          id?: string
          created_at?: string
          full_name?: string
          email?: string
          phone?: string
          country?: string
          primary_platform?: string
          profile_link?: string
          follower_count?: string
          community_type?: string
          community_size?: string | null
          community_link?: string | null
          actively_trades?: string
          trading_style?: string
          passed_challenge?: string
          challenge_platform?: string | null
          willing_to_pass_publicly?: string
          why_funded_ng?: string
          content_type?: string
          other_prop_firms?: string
          sample_content_link?: string | null
          agree_no_giveaway_only?: boolean
          agree_public_challenge?: boolean
          agree_no_dm?: boolean
          agree_terms?: boolean
          status?: string
        }
        Relationships: []
      }
      partner_clicks: {
        Row: {
          created_at: string
          id: string
          partner_id: string | null
          promo_code: string
          referer: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id?: string | null
          promo_code: string
          referer?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string | null
          promo_code?: string
          referer?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      partner_free_accounts: {
        Row: {
          account_size: number
          admin_note: string | null
          challenge_name: string
          created_at: string
          fulfilled_at: string | null
          id: string
          investor_password: string | null
          mt5_login: string | null
          mt5_password: string | null
          mt5_server: string | null
          partner_id: string
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          account_size?: number
          admin_note?: string | null
          challenge_name?: string
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          investor_password?: string | null
          mt5_login?: string | null
          mt5_password?: string | null
          mt5_server?: string | null
          partner_id: string
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_size?: number
          admin_note?: string | null
          challenge_name?: string
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          investor_password?: string | null
          mt5_login?: string | null
          mt5_password?: string | null
          mt5_server?: string | null
          partner_id?: string
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_payouts: {
        Row: {
          admin_note: string | null
          amount_naira: number
          approved_at: string | null
          bank_details: Json | null
          created_at: string
          id: string
          partner_id: string
          processed_at: string | null
          requested_at: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          amount_naira: number
          approved_at?: string | null
          bank_details?: Json | null
          created_at?: string
          id?: string
          partner_id: string
          processed_at?: string | null
          requested_at?: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          amount_naira?: number
          approved_at?: string | null
          bank_details?: Json | null
          created_at?: string
          id?: string
          partner_id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
        }
        Relationships: []
      }
      partner_profiles: {
        Row: {
          commission_rate: number
          created_at: string
          id: string
          is_active: boolean
          promo_code: string
          total_earned_naira: number
          total_paid_naira: number
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          id?: string
          is_active?: boolean
          promo_code: string
          total_earned_naira?: number
          total_paid_naira?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          id?: string
          is_active?: boolean
          promo_code?: string
          total_earned_naira?: number
          total_paid_naira?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_referrals: {
        Row: {
          amount_paid_naira: number
          commission_amount_naira: number
          created_at: string
          id: string
          order_id: string | null
          partner_id: string
          referred_user_id: string
        }
        Insert: {
          amount_paid_naira?: number
          commission_amount_naira?: number
          created_at?: string
          id?: string
          order_id?: string | null
          partner_id: string
          referred_user_id: string
        }
        Update: {
          amount_paid_naira?: number
          commission_amount_naira?: number
          created_at?: string
          id?: string
          order_id?: string | null
          partner_id?: string
          referred_user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          admin_note: string | null
          amount_naira: number
          bank_details: Json | null
          created_at: string
          id: string
          payment_method: Database["public"]["Enums"]["payout_method"]
          processed_at: string | null
          profit_percent: number | null
          status: Database["public"]["Enums"]["payout_status"]
          trader_account_id: string
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_naira: number
          bank_details?: Json | null
          created_at?: string
          id?: string
          payment_method: Database["public"]["Enums"]["payout_method"]
          processed_at?: string | null
          profit_percent?: number | null
          status?: Database["public"]["Enums"]["payout_status"]
          trader_account_id: string
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_naira?: number
          bank_details?: Json | null
          created_at?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payout_method"]
          processed_at?: string | null
          profit_percent?: number | null
          status?: Database["public"]["Enums"]["payout_status"]
          trader_account_id?: string
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_trader_account_id_fkey"
            columns: ["trader_account_id"]
            isOneToOne: false
            referencedRelation: "trader_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          full_name: string
          id: string
          is_affiliate: boolean
          kyc_verified: boolean
          partner_referred_by: string | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_affiliate?: boolean
          kyc_verified?: boolean
          partner_referred_by?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_affiliate?: boolean
          kyc_verified?: boolean
          partner_referred_by?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          first_paid_at: string | null
          id: string
          referred_user_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          first_paid_at?: string | null
          id?: string
          referred_user_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          first_paid_at?: string | null
          id?: string
          referred_user_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          admin_reply: string | null
          created_at: string
          id: string
          message: string
          order_id: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message: string
          order_id?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message?: string
          order_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trader_accounts: {
        Row: {
          breach_reason: string | null
          challenge_id: string
          created_at: string
          currency: string | null
          current_equity: number | null
          current_phase: number
          deleted_at: string | null
          funded_at: string | null
          funded_requested_at: string | null
          id: string
          investor_password: string | null
          last_synced_at: string | null
          metaapi_account_id: string | null
          mt5_login: string
          mt5_password: string
          mt5_server: string
          order_id: string
          peak_equity: number | null
          phase1_passed_at: string | null
          phase2_passed_at: string | null
          phase2_requested_at: string | null
          phase_progression_pending: string | null
          phase_rejected_at: string | null
          phase_rejected_reason: string | null
          provider: string
          scalping_warnings: number
          starting_balance: number
          status: Database["public"]["Enums"]["account_status"]
          trading_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          breach_reason?: string | null
          challenge_id: string
          created_at?: string
          currency?: string | null
          current_equity?: number | null
          current_phase?: number
          deleted_at?: string | null
          funded_at?: string | null
          funded_requested_at?: string | null
          id?: string
          investor_password?: string | null
          last_synced_at?: string | null
          metaapi_account_id?: string | null
          mt5_login: string
          mt5_password: string
          mt5_server?: string
          order_id: string
          peak_equity?: number | null
          phase1_passed_at?: string | null
          phase2_passed_at?: string | null
          phase2_requested_at?: string | null
          phase_progression_pending?: string | null
          phase_rejected_at?: string | null
          phase_rejected_reason?: string | null
          provider?: string
          scalping_warnings?: number
          starting_balance: number
          status?: Database["public"]["Enums"]["account_status"]
          trading_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          breach_reason?: string | null
          challenge_id?: string
          created_at?: string
          currency?: string | null
          current_equity?: number | null
          current_phase?: number
          deleted_at?: string | null
          funded_at?: string | null
          funded_requested_at?: string | null
          id?: string
          investor_password?: string | null
          last_synced_at?: string | null
          metaapi_account_id?: string | null
          mt5_login?: string
          mt5_password?: string
          mt5_server?: string
          order_id?: string
          peak_equity?: number | null
          phase1_passed_at?: string | null
          phase2_passed_at?: string | null
          phase2_requested_at?: string | null
          phase_progression_pending?: string | null
          phase_rejected_at?: string | null
          phase_rejected_reason?: string | null
          provider?: string
          scalping_warnings?: number
          starting_balance?: number
          status?: Database["public"]["Enums"]["account_status"]
          trading_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trader_accounts_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trader_accounts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_status: {
        Row: {
          group_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_status_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      assign_partner_role: {
        Args: { _commission_rate?: number; _email: string }
        Returns: string
      }
      attach_partner_referral: { Args: { _code: string }; Returns: boolean }
      attach_referral: { Args: { _code: string }; Returns: boolean }
      auto_pay_approved_affiliate_payouts: { Args: never; Returns: number }
      claim_admin_if_unclaimed: { Args: never; Returns: boolean }
      claim_free_account: { Args: never; Returns: string }
      claim_partner_free_account: { Args: never; Returns: string }
      delete_partner_role: { Args: { _partner_profile_id: string }; Returns: undefined }
      gen_partner_promo_code: { Args: { _full_name: string }; Returns: string }
      validate_partner_code: { Args: { _code: string }; Returns: boolean }
      generate_affiliate_code: { Args: never; Returns: string }
      get_affiliate_claimable_batch: {
        Args: { p_affiliate_id: string }
        Returns: number
      }
      get_total_payouts: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_discount_redemption: {
        Args: { _code: string }
        Returns: undefined
      }
      notify_push_event: {
        Args: {
          _admins?: boolean
          _body: string
          _event: string
          _title: string
          _url?: string
          _user_id: string
        }
        Returns: undefined
      }
      request_affiliate_payout: { Args: { _amount: number }; Returns: string }
      request_funded: { Args: { _account_id: string }; Returns: boolean }
      request_partner_payout: { Args: { _amount: number }; Returns: string }
      request_phase2: { Args: { _account_id: string }; Returns: boolean }
      send_telegram: { Args: { p_message: string }; Returns: undefined }
      track_partner_click: {
        Args: { _code: string; _ref?: string; _ua?: string }
        Returns: boolean
      }
      validate_discount_code: {
        Args: { _code: string }
        Returns: {
          code: string
          percent_off: number
        }[]
      }
    }
    Enums: {
      account_status: "active" | "breached" | "passed" | "funded"
      app_role: "admin" | "trader" | "partner"
      certificate_kind: "funded" | "payout"
      order_status:
        | "pending"
        | "paid"
        | "delivered"
        | "manual_pending"
        | "failed"
      payout_method: "usdt" | "bank_transfer"
      payout_status: "pending" | "approved" | "paid" | "rejected"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_status: ["active", "breached", "passed", "funded"],
      app_role: ["admin", "trader", "partner"],
      certificate_kind: ["funded", "payout"],
      order_status: [
        "pending",
        "paid",
        "delivered",
        "manual_pending",
        "failed",
      ],
      payout_method: ["usdt", "bank_transfer"],
      payout_status: ["pending", "approved", "paid", "rejected"],
    },
  },
} as const