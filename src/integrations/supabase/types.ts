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
      abex_index: {
        Row: {
          bron: string | null
          created_at: string
          id: string
          indexwaarde: number
          ingangsdatum: string
          manueel_ingevoerd: boolean
          periode: string
        }
        Insert: {
          bron?: string | null
          created_at?: string
          id?: string
          indexwaarde: number
          ingangsdatum: string
          manueel_ingevoerd?: boolean
          periode: string
        }
        Update: {
          bron?: string | null
          created_at?: string
          id?: string
          indexwaarde?: number
          ingangsdatum?: string
          manueel_ingevoerd?: boolean
          periode?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          actie: string
          detail_json: Json | null
          dossier_id: string | null
          id: string
          timestamp: string
          uitgevoerd_door: string | null
        }
        Insert: {
          actie: string
          detail_json?: Json | null
          dossier_id?: string | null
          id?: string
          timestamp?: string
          uitgevoerd_door?: string | null
        }
        Update: {
          actie?: string
          detail_json?: Json | null
          dossier_id?: string | null
          id?: string
          timestamp?: string
          uitgevoerd_door?: string | null
        }
        Relationships: []
      }
      dossiers: {
        Row: {
          abex_index_gebruikt: number | null
          abex_periode: string | null
          ai_aanbeveling: string | null
          ai_analyse_op: string | null
          ai_score: number | null
          ai_verdacht_label: string | null
          beheerder_id: string | null
          bestek_filename: string | null
          bestek_storage_path: string | null
          bestek_uploaded_at: string | null
          bezwaar_op: string | null
          bezwaar_tekst: string | null
          created_at: string
          dossiernummer: string
          heeft_indirecte_verliezen: boolean
          heeft_vrijstelling: boolean
          id: string
          klant_adres: string | null
          klant_naam: string
          klant_rijksregister: string | null
          ondertekend_op: string | null
          ondertekend_pdf_path: string | null
          polis_nummer: string | null
          schade_datum: string | null
          schade_omschrijving: string | null
          schade_type: Database["public"]["Enums"]["schade_type"] | null
          status: Database["public"]["Enums"]["dossier_status"]
          updated_at: string
          verzekeraar: Database["public"]["Enums"]["verzekeraar"] | null
          vrijstelling_bedrag: number
        }
        Insert: {
          abex_index_gebruikt?: number | null
          abex_periode?: string | null
          ai_aanbeveling?: string | null
          ai_analyse_op?: string | null
          ai_score?: number | null
          ai_verdacht_label?: string | null
          beheerder_id?: string | null
          bestek_filename?: string | null
          bestek_storage_path?: string | null
          bestek_uploaded_at?: string | null
          bezwaar_op?: string | null
          bezwaar_tekst?: string | null
          created_at?: string
          dossiernummer?: string
          heeft_indirecte_verliezen?: boolean
          heeft_vrijstelling?: boolean
          id?: string
          klant_adres?: string | null
          klant_naam: string
          klant_rijksregister?: string | null
          ondertekend_op?: string | null
          ondertekend_pdf_path?: string | null
          polis_nummer?: string | null
          schade_datum?: string | null
          schade_omschrijving?: string | null
          schade_type?: Database["public"]["Enums"]["schade_type"] | null
          status?: Database["public"]["Enums"]["dossier_status"]
          updated_at?: string
          verzekeraar?: Database["public"]["Enums"]["verzekeraar"] | null
          vrijstelling_bedrag?: number
        }
        Update: {
          abex_index_gebruikt?: number | null
          abex_periode?: string | null
          ai_aanbeveling?: string | null
          ai_analyse_op?: string | null
          ai_score?: number | null
          ai_verdacht_label?: string | null
          beheerder_id?: string | null
          bestek_filename?: string | null
          bestek_storage_path?: string | null
          bestek_uploaded_at?: string | null
          bezwaar_op?: string | null
          bezwaar_tekst?: string | null
          created_at?: string
          dossiernummer?: string
          heeft_indirecte_verliezen?: boolean
          heeft_vrijstelling?: boolean
          id?: string
          klant_adres?: string | null
          klant_naam?: string
          klant_rijksregister?: string | null
          ondertekend_op?: string | null
          ondertekend_pdf_path?: string | null
          polis_nummer?: string | null
          schade_datum?: string | null
          schade_omschrijving?: string | null
          schade_type?: Database["public"]["Enums"]["schade_type"] | null
          status?: Database["public"]["Enums"]["dossier_status"]
          updated_at?: string
          verzekeraar?: Database["public"]["Enums"]["verzekeraar"] | null
          vrijstelling_bedrag?: number
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_door_naam: string | null
          aangemaakt_op: string
          abex_basisindex: number | null
          bron_bestand: string
          created_at: string
          geldig_van: string | null
          id: string
          status: string
          verzekeraar: string
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_door_naam?: string | null
          aangemaakt_op?: string
          abex_basisindex?: number | null
          bron_bestand: string
          created_at?: string
          geldig_van?: string | null
          id?: string
          status?: string
          verzekeraar: string
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_door_naam?: string | null
          aangemaakt_op?: string
          abex_basisindex?: number | null
          bron_bestand?: string
          created_at?: string
          geldig_van?: string | null
          id?: string
          status?: string
          verzekeraar?: string
        }
        Relationships: []
      }
      klant_tokens: {
        Row: {
          bezwaar_tekst: string | null
          created_at: string
          dossier_id: string
          expires_at: string
          gebruikt: boolean
          handtekening_data: string | null
          id: string
          ondertekend_op: string | null
          token: string
        }
        Insert: {
          bezwaar_tekst?: string | null
          created_at?: string
          dossier_id: string
          expires_at: string
          gebruikt?: boolean
          handtekening_data?: string | null
          id?: string
          ondertekend_op?: string | null
          token: string
        }
        Update: {
          bezwaar_tekst?: string | null
          created_at?: string
          dossier_id?: string
          expires_at?: string
          gebruikt?: boolean
          handtekening_data?: string | null
          id?: string
          ondertekend_op?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "klant_tokens_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      referentieprijzen: {
        Row: {
          abex_basisindex: number | null
          basisprijs: number
          batch_id: string | null
          bron_bestand: string | null
          categorie: string | null
          created_at: string
          eenheid: string | null
          geldig_van: string | null
          id: string
          omschrijving: string
          verzekeraar: string
        }
        Insert: {
          abex_basisindex?: number | null
          basisprijs?: number
          batch_id?: string | null
          bron_bestand?: string | null
          categorie?: string | null
          created_at?: string
          eenheid?: string | null
          geldig_van?: string | null
          id?: string
          omschrijving: string
          verzekeraar?: string
        }
        Update: {
          abex_basisindex?: number | null
          basisprijs?: number
          batch_id?: string | null
          bron_bestand?: string | null
          categorie?: string | null
          created_at?: string
          eenheid?: string | null
          geldig_van?: string | null
          id?: string
          omschrijving?: string
          verzekeraar?: string
        }
        Relationships: [
          {
            foreignKeyName: "referentieprijzen_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      schade_lijnen: {
        Row: {
          afwijking_percentage: number | null
          ai_oordeel: Database["public"]["Enums"]["ai_oordeel"]
          created_at: string
          dossier_id: string
          eenheid: string | null
          eenheidsprijs_excl_abex: number
          eenheidsprijs_incl_abex: number
          hoeveelheid: number
          id: string
          omschrijving: string
          referentieprijs_baloise: number | null
          subtotaal: number
        }
        Insert: {
          afwijking_percentage?: number | null
          ai_oordeel?: Database["public"]["Enums"]["ai_oordeel"]
          created_at?: string
          dossier_id: string
          eenheid?: string | null
          eenheidsprijs_excl_abex?: number
          eenheidsprijs_incl_abex?: number
          hoeveelheid?: number
          id?: string
          omschrijving: string
          referentieprijs_baloise?: number | null
          subtotaal?: number
        }
        Update: {
          afwijking_percentage?: number | null
          ai_oordeel?: Database["public"]["Enums"]["ai_oordeel"]
          created_at?: string
          dossier_id?: string
          eenheid?: string | null
          eenheidsprijs_excl_abex?: number
          eenheidsprijs_incl_abex?: number
          hoeveelheid?: number
          id?: string
          omschrijving?: string
          referentieprijs_baloise?: number | null
          subtotaal?: number
        }
        Relationships: [
          {
            foreignKeyName: "schade_lijnen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_dossiernummer: { Args: never; Returns: string }
    }
    Enums: {
      ai_oordeel:
        | "conform"
        | "licht_verhoogd"
        | "niet_conform"
        | "niet_beoordeeld"
      dossier_status:
        | "concept"
        | "berekening"
        | "bestekanalyse"
        | "akkoord"
        | "afgerond"
        | "doorgestuurd_verzekeraar"
      schade_type:
        | "waterschade"
        | "brandschade"
        | "glasbraak"
        | "stormschade"
        | "tuinafsluiting"
        | "andere"
      verzekeraar: "baloise" | "axa" | "vivium" | "ag_insurance"
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
      ai_oordeel: [
        "conform",
        "licht_verhoogd",
        "niet_conform",
        "niet_beoordeeld",
      ],
      dossier_status: [
        "concept",
        "berekening",
        "bestekanalyse",
        "akkoord",
        "afgerond",
        "doorgestuurd_verzekeraar",
      ],
      schade_type: [
        "waterschade",
        "brandschade",
        "glasbraak",
        "stormschade",
        "tuinafsluiting",
        "andere",
      ],
      verzekeraar: ["baloise", "axa", "vivium", "ag_insurance"],
    },
  },
} as const
